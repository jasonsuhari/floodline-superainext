'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AgentKind, WalkClip, WalkFrame } from '@/types'
import { getAgentModel } from '@/lib/agentIdentity'

const WALK_DATA_URL = '/generated/ai4animation-low-poly-guy.json'

type Rig = {
  root: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  bike?: THREE.Group
}

function makeMat(color: THREE.ColorRepresentation, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, flatShading: true })
}

function block(w: number, h: number, d: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function limb(name: string, length: number, thick: number, m: THREE.Material) {
  const pivot = new THREE.Group()
  pivot.name = name
  const seg = block(thick, length, thick, m)
  seg.position.y = -length / 2
  pivot.add(seg)
  return pivot
}

function shirtColorForSeed(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = (h % 360) / 360
  return new THREE.Color().setHSL(hue, 0.62, 0.55)
}

function addAccessory(root: THREE.Group, kind: AgentKind, accessory: ReturnType<typeof getAgentModel>['interview']['accessory']) {
  if (accessory === 'backpack') {
    const pack = block(0.55, 0.7, 0.25, makeMat(0x242a33))
    pack.position.set(0, 1.65, -0.3)
    root.add(pack)
  }

  if (accessory === 'briefcase' || accessory === 'shopping-bag') {
    const bag = block(0.34, accessory === 'shopping-bag' ? 0.42 : 0.32, 0.18, makeMat(accessory === 'shopping-bag' ? 0xffe678 : 0x18181b))
    bag.position.set(0.62, 1.08, 0.1)
    root.add(bag)
  }

  if (accessory === 'cargo-box') {
    const box = block(0.62, 0.66, 0.34, makeMat(0xf5f5dc))
    box.position.set(0, 1.55, -0.36)
    root.add(box)
  }

  if (accessory === 'cane') {
    const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5), makeMat(0x5f3e24, 0.7))
    cane.position.set(0.56, 1.04, 0.1)
    cane.rotation.z = -0.22
    cane.castShadow = true
    root.add(cane)
  }

  if (accessory === 'helmet' || accessory === 'hard-hat' || accessory === 'cap') {
    const color = accessory === 'hard-hat' ? 0xffd640 : accessory === 'cap' ? 0x0a0e18 : 0x232830
    const hat = block(0.62, 0.16, 0.62, makeMat(color))
    hat.position.y = 2.82
    root.add(hat)
  }

  if (accessory === 'apron') {
    const apron = block(0.46, 0.7, 0.08, makeMat(0x1e1e1e))
    apron.position.set(0, 1.47, 0.25)
    root.add(apron)
  }

  if (accessory === 'glow') {
    const glow = block(0.42, 0.16, 0.08, makeMat(0xff5adc, 0.5))
    glow.position.set(0, 1.95, 0.26)
    root.add(glow)
  }

  if (accessory === 'child-marker') {
    const child = buildMiniRig(kind)
    child.position.set(-0.9, 0, -0.15)
    root.add(child)
  }
}

function buildMiniRig(parentKind: AgentKind) {
  const mini = new THREE.Group()
  mini.name = `${parentKind}-child-marker`
  mini.scale.setScalar(0.62)
  const shirt = makeMat(0xff9650)
  const skin = makeMat(0xffd6ad)
  const pants = makeMat(0x222222)
  const body = block(0.72, 1.05, 0.42, shirt)
  body.position.y = 1.6
  const head = block(0.62, 0.62, 0.62, skin)
  head.position.y = 2.44
  const leftLeg = limb('mini-left-leg', 0.84, 0.22, pants)
  leftLeg.position.set(-0.22, 1.08, 0)
  const rightLeg = limb('mini-right-leg', 0.84, 0.22, pants)
  rightLeg.position.set(0.22, 1.08, 0)
  mini.add(body, head, leftLeg, rightLeg)
  return mini
}

function buildRig(kind: AgentKind, shirtColor: THREE.Color): Rig {
  const model = getAgentModel(kind)
  const root = new THREE.Group()
  root.name = 'interview-rig'
  root.scale.setScalar(model.interview.scale)

  const skinMat = makeMat(model.interview.skin)
  const shirtMat = makeMat(kind === 'walker' ? shirtColor : model.interview.shirt)
  const pantsMat = makeMat(model.interview.pants)

  const body = block(0.72, 1.05, 0.42, shirtMat)
  body.position.y = 1.6
  root.add(body)

  const head = block(0.62, 0.62, 0.62, skinMat)
  head.position.y = 2.44
  root.add(head)

  const leftArm = limb('left-arm', 0.76, 0.18, shirtMat)
  leftArm.position.set(-0.49, 1.96, 0)
  leftArm.rotation.z = -0.13
  root.add(leftArm)

  const rightArm = limb('right-arm', 0.76, 0.18, shirtMat)
  rightArm.position.set(0.49, 1.96, 0)
  rightArm.rotation.z = 0.13
  root.add(rightArm)

  const leftLeg = limb('left-leg', 0.84, 0.22, pantsMat)
  leftLeg.position.set(-0.22, 1.08, 0)
  root.add(leftLeg)

  const rightLeg = limb('right-leg', 0.84, 0.22, pantsMat)
  rightLeg.position.set(0.22, 1.08, 0)
  root.add(rightLeg)

  addAccessory(root, kind, model.interview.accessory)

  // Riders get a simple bicycle/scooter frame.
  let bike: THREE.Group | undefined
  if (kind === 'cyclist' || kind === 'delivery-rider') {
    bike = new THREE.Group()
    const frameMat = makeMat(0x2dd4bf, 0.5)
    const tireMat = makeMat(0x111111, 0.9)

    const wheelL = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 24), tireMat)
    wheelL.position.set(-0.7, 0.42, 0)
    wheelL.rotation.y = Math.PI / 2
    bike.add(wheelL)

    const wheelR = wheelL.clone()
    wheelR.position.x = 0.7
    bike.add(wheelR)

    const bar = block(1.4, 0.08, 0.08, frameMat)
    bar.position.y = 0.55
    bike.add(bar)

    const seatPost = block(0.08, 0.5, 0.08, frameMat)
    seatPost.position.set(-0.2, 0.78, 0)
    bike.add(seatPost)

    const handlebar = block(0.08, 0.5, 0.08, frameMat)
    handlebar.position.set(0.6, 0.85, 0)
    bike.add(handlebar)

    bike.position.y = 0
    root.add(bike)
  }

  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, bike }
}

function applyFrame(rig: Rig, frame: WalkFrame, elapsed: number, kind: AgentKind) {
  const model = getAgentModel(kind)
  const speedMul = model.interview.speedMul
  const stride = model.interview.stride

  rig.root.position.y = (frame.root[1] - 1) * 0.4
  rig.root.rotation.z = frame.bodyTilt * 0.4
  rig.body.rotation.x = frame.bodyTilt * 0.4 + model.interview.hunch
  rig.head.rotation.x = Math.sin(frame.time * 2.2) * 0.04 + model.interview.hunch * 0.35
  rig.head.rotation.z = frame.headTilt * 0.5

  // Subtle yaw so they feel alive
  rig.root.rotation.y = Math.sin(elapsed * 0.6 * speedMul) * 0.08

  if (kind === 'cyclist' || kind === 'delivery-rider') {
    // Pedaling: legs cycle full rotation, arms hold bars
    rig.leftLeg.rotation.x = Math.sin(elapsed * 6) * 0.9
    rig.rightLeg.rotation.x = Math.sin(elapsed * 6 + Math.PI) * 0.9
    rig.leftArm.rotation.x = -0.4
    rig.rightArm.rotation.x = -0.4
    return
  }

  rig.leftArm.rotation.x = frame.leftArm * stride * speedMul
  rig.rightArm.rotation.x = frame.rightArm * stride * speedMul
  rig.leftLeg.rotation.x = frame.leftLeg * stride * speedMul
  rig.rightLeg.rotation.x = frame.rightLeg * stride * speedMul
}

interface InterviewWalkerProps {
  agentKind?: AgentKind
  agentSeed: string
}

export default function InterviewWalker({ agentKind = 'walker', agentSeed }: InterviewWalkerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let animationId = 0
    const clock = new THREE.Clock()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // Soft "video call" gradient background via fog + clear color
    scene.background = new THREE.Color(0x0e1620)

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 50)
    camera.position.set(0, 2.0, 5.6)
    camera.lookAt(0, 1.7, 0)

    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x0a1018, 1.4)
    scene.add(hemi)

    const key = new THREE.DirectionalLight(0xffe7b6, 2.2)
    key.position.set(2.5, 4, 3)
    scene.add(key)

    const rim = new THREE.DirectionalLight(0x60a5fa, 1.2)
    rim.position.set(-3, 3, -2)
    scene.add(rim)

    // Ground disc
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x141d28, roughness: 0.9, metalness: 0 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const rig = buildRig(agentKind, shirtColorForSeed(agentSeed))
    scene.add(rig.root)

    let clip: WalkClip | null = null
    fetch(WALK_DATA_URL)
      .then(r => r.ok ? r.json() as Promise<WalkClip> : Promise.reject(new Error('walk clip missing')))
      .then(c => { if (!disposed) clip = c })
      .catch(() => { /* fall back to procedural sway */ })

    const fallbackFrame: WalkFrame = {
      time: 0, root: [0, 1, 0], yaw: 0, bodyTilt: 0, headTilt: 0,
      leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0,
    }

    const animate = () => {
      const elapsed = clock.getElapsedTime()
      let frame = fallbackFrame
      if (clip) {
        const idx = Math.floor((elapsed * clip.fps) % clip.frames.length)
        frame = clip.frames[idx]
      } else {
        frame = {
          ...fallbackFrame,
          time: elapsed,
          leftArm: Math.sin(elapsed * 4) * 0.6,
          rightArm: -Math.sin(elapsed * 4) * 0.6,
          leftLeg: -Math.sin(elapsed * 4) * 0.6,
          rightLeg: Math.sin(elapsed * 4) * 0.6,
        }
      }
      applyFrame(rig, frame, elapsed, agentKind)
      renderer.render(scene, camera)
      animationId = window.requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(handleResize)
    ro.observe(mount)

    return () => {
      disposed = true
      ro.disconnect()
      window.cancelAnimationFrame(animationId)
      renderer.dispose()
      try { mount.removeChild(renderer.domElement) } catch { /* ignore */ }
    }
  }, [agentKind, agentSeed])

  return <div ref={mountRef} className="interview-walker" />
}
