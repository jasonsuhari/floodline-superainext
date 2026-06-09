'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const SHIRT_PALETTE = [
  0xff6b6b, 0x4ecdc4, 0xfeca57, 0x54a0ff,
  0xff9ff3, 0x5f27cd, 0x00d2d3, 0xff9f43,
]
const PANTS_PALETTE = [0x15191f, 0x263447, 0x30323a, 0x202020]
const SKIN_PALETTE  = [0xffc994, 0xf2b178, 0x8f5f3c, 0xe0a46f]
const HAIR_PALETTE  = [0x24140f, 0x111111, 0x5a3825, 0xc79a5c]

const STEP_FREQ = 0.48
const CYL_AXIS = new THREE.Vector3(0, 1, 0)

interface Props {
  agentIndex: number
}

export default function AgentCameraFeed({ agentIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    const scene = new THREE.Scene()

    // Perspective camera — slightly above, angled down to frame face + upper body
    const aspect = canvas.clientWidth / canvas.clientHeight
    const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100)
    camera.position.set(0.18, 1.52, 2.1)
    camera.lookAt(0, 1.15, 0)

    // Lighting — warm front key + cool fill + ambient
    const ambient = new THREE.AmbientLight(0x8fa0c0, 0.7)
    scene.add(ambient)
    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.1)
    keyLight.position.set(1.2, 3, 2.5)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x4070c0, 0.3)
    fillLight.position.set(-2, 1, -1)
    scene.add(fillLight)

    const idx = agentIndex
    const shirtHex = SHIRT_PALETTE[idx % SHIRT_PALETTE.length]
    const pantsHex = PANTS_PALETTE[idx % PANTS_PALETTE.length]
    const skinHex  = SKIN_PALETTE[idx % SKIN_PALETTE.length]
    const hairHex  = HAIR_PALETTE[idx % HAIR_PALETTE.length]

    const mat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex })

    // Shared geometry (same low-poly style as CrowdLayer)
    const cylGeo  = new THREE.CylinderGeometry(1, 1, 1, 5)
    const headGeo = new THREE.SphereGeometry(0.14, 8, 6)
    const hairGeo = new THREE.SphereGeometry(0.145, 7, 5)
    const footGeo = new THREE.BoxGeometry(1, 1, 1)

    const headMesh  = new THREE.Mesh(headGeo, mat(skinHex))
    const hairMesh  = new THREE.Mesh(hairGeo, mat(hairHex))
    const torsoMesh = new THREE.Mesh(cylGeo,  mat(shirtHex))
    const lArmMesh  = new THREE.Mesh(cylGeo,  mat(shirtHex))
    const rArmMesh  = new THREE.Mesh(cylGeo,  mat(shirtHex))
    const lLegMesh  = new THREE.Mesh(cylGeo,  mat(pantsHex))
    const rLegMesh  = new THREE.Mesh(cylGeo,  mat(pantsHex))
    const lFootMesh = new THREE.Mesh(footGeo, mat(pantsHex))
    const rFootMesh = new THREE.Mesh(footGeo, mat(pantsHex))

    scene.add(headMesh, hairMesh, torsoMesh, lArmMesh, rArmMesh, lLegMesh, rLegMesh, lFootMesh, rFootMesh)

    // Reused scratch vectors
    const vA   = new THREE.Vector3()
    const vB   = new THREE.Vector3()
    const vDir = new THREE.Vector3()
    const vMid = new THREE.Vector3()

    const placeLimb = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      vDir.subVectors(b, a)
      const len = vDir.length()
      if (len < 1e-6) return
      vDir.divideScalar(len)
      vMid.addVectors(a, b).multiplyScalar(0.5)
      mesh.position.copy(vMid)
      mesh.quaternion.setFromUnitVectors(CYL_AXIS, vDir)
      mesh.scale.set(radius, len, radius)
    }

    const onResize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
      camera.aspect = canvas.clientWidth / canvas.clientHeight
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(canvas)

    let raf = 0
    const clock = new THREE.Clock()

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      const phase   = t * STEP_FREQ * Math.PI * 2
      const legFwd  =  Math.sin(phase) * 0.22
      const armFwd  = -Math.sin(phase) * 0.15
      const bob     =  Math.max(0, Math.sin(phase * 2)) * 0.022

      const groundY  = 0
      const hipY     = 0.84 + bob
      const waistY   = 0.94 + bob
      const chestY   = 1.33 + bob
      const shoulderY = 1.30 + bob
      const handY    = 0.83 + bob
      const headY    = 1.60 + bob
      const hairY    = 1.65 + bob

      const hipW = 0.095
      const armW = 0.215

      // Torso
      vA.set(0, waistY, 0); vB.set(0, chestY, 0)
      placeLimb(torsoMesh, vA, vB, 0.092)

      // Head
      headMesh.position.set(0, headY, 0)
      headMesh.scale.setScalar(1)
      headMesh.quaternion.identity()

      // Hair (slightly back + above)
      hairMesh.position.set(0, hairY, -0.025)
      hairMesh.scale.set(1.04, 0.74, 0.54)
      hairMesh.quaternion.identity()

      // Legs
      vA.set(-hipW, hipY, 0); vB.set(-hipW, groundY + 0.04, legFwd)
      placeLimb(lLegMesh, vA, vB, 0.052)
      vA.set( hipW, hipY, 0); vB.set( hipW, groundY + 0.04, -legFwd)
      placeLimb(rLegMesh, vA, vB, 0.052)

      // Feet
      lFootMesh.position.set(-hipW, groundY + 0.032, legFwd)
      lFootMesh.rotation.set(0, legFwd > 0 ? 0.18 : -0.18, 0)
      lFootMesh.scale.set(0.072, 0.052, 0.125)

      rFootMesh.position.set(hipW, groundY + 0.032, -legFwd)
      rFootMesh.rotation.set(0, -legFwd > 0 ? 0.18 : -0.18, 0)
      rFootMesh.scale.set(0.072, 0.052, 0.125)

      // Arms
      vA.set(-armW, shoulderY, 0); vB.set(-armW - 0.02, handY, armFwd)
      placeLimb(lArmMesh, vA, vB, 0.046)
      vA.set( armW, shoulderY, 0); vB.set( armW + 0.02, handY, -armFwd)
      placeLimb(rArmMesh, vA, vB, 0.046)

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      cylGeo.dispose(); headGeo.dispose(); hairGeo.dispose(); footGeo.dispose()
    }
  }, [agentIndex])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
