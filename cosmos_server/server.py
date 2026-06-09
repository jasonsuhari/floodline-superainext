import io
import json
import uuid
import os

import httpx
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image

app = FastAPI()
pipe = None


@app.on_event("startup")
async def load_model():
    global pipe
    from diffusers import Cosmos3OmniPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler

    model_id = os.environ.get("COSMOS_MODEL", "nvidia/Cosmos3-Nano")
    print(f"Loading {model_id} …")

    pipe = Cosmos3OmniPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16,
        device_map="cuda",
        enable_safety_checker=False,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(
        pipe.scheduler.config, flow_shift=10.0
    )
    print("Model ready.")


class GenerateRequest(BaseModel):
    image_url: str
    prompt: str          # plain text — server wraps into Cosmos JSON format
    num_frames: int = 81 # 81 = ~3.4s at 24fps; max 189 for full ~8s
    seed: int = 42


@app.post("/generate")
async def generate(req: GenerateRequest):
    if pipe is None:
        raise HTTPException(503, "Model not loaded yet")

    # --- fetch input image ---
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(req.image_url)
        resp.raise_for_status()
    image = Image.open(io.BytesIO(resp.content)).convert("RGB").resize((832, 480))

    # --- build Cosmos prompt JSON ---
    cosmos_prompt = json.dumps({"prompt": req.prompt})
    cosmos_negative = json.dumps({
        "negative_prompt": (
            "cartoon, animation, painting, drawing, blurry, overexposed, "
            "static, low quality, watermark, text, logo"
        )
    })

    # --- run inference ---
    result = pipe(
        image=image,
        prompt=cosmos_prompt,
        negative_prompt=cosmos_negative,
        num_frames=req.num_frames,
        height=480,
        width=832,
        num_inference_steps=20,
        guidance_scale=6.0,
        add_resolution_template=False,
        add_duration_template=False,
        generator=torch.Generator(device="cuda").manual_seed(req.seed),
    )

    # --- save to /tmp and return ---
    from diffusers.utils import export_to_video
    out = f"/tmp/cosmos_{uuid.uuid4().hex}.mp4"
    export_to_video(result.video, out, fps=24, quality=7, macro_block_size=1)
    return FileResponse(out, media_type="video/mp4")


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": pipe is not None}
