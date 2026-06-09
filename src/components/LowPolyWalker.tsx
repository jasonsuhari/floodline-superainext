'use client'

import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type WalkFrame = {
  time: number
  root: [number, number, number]
  yaw: number
  bodyTilt: number
  headTilt: number
  leftArm: number
  rightArm: number
  leftLeg: number
  rightLeg: number
}

type WalkClip = {
  source: string
  fps: number
  durationSeconds: number
  frames: WalkFrame[]
}

type MediaTarget = 'billboard' | 'shelter' | 'poster'

type PersonRig = {
  root: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  base: THREE.Vector3
  phase: number
  speed: number
  stride: number
  hunch: number
  bob: number
}

type CarRig = {
  root: THREE.Group
  wheels: THREE.Mesh[]
  base: THREE.Vector3
}

type ShowcaseRig =
  | { kind: 'person'; person: PersonRig }
  | { kind: 'car'; car: CarRig }
  | { kind: 'group'; people: PersonRig[] }

const WALK_DATA_URL = '/generated/ai4animation-low-poly-guy.json'
const PANTS_COLOR = 0x050505
const MEDIA_TARGET_LABELS: Record<MediaTarget, string> = {
  billboard: 'Billboard',
  shelter: 'Bus Shelter',
  poster: 'Poster',
}

function randomShirtColor() {
  return new THREE.Color().setHSL(Math.random(), 0.66, 0.55)
}

function makeMaterial(color: THREE.ColorRepresentation, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03,
    flatShading: true,
  })
}

function makeDisplayMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.18,
    roughness: 0.62,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
}

function createBlock(width: number, height: number, depth: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createDisplayPanel(width: number, height: number, material: THREE.Material) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  panel.castShadow = false
  panel.receiveShadow = false
  return panel
}

function createLimb(name: string, length: number, thickness: number, material: THREE.Material) {
  const pivot = new THREE.Group()
  pivot.name = name

  const limb = createBlock(thickness, length, thickness, material)
  limb.position.y = -length / 2
  pivot.add(limb)

  return pivot
}

function addCane(root: THREE.Group) {
  const cane = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5),
    makeMaterial(0x5b3a22, 0.7)
  )
  cane.position.set(0.56, 1.06, 0.1)
  cane.rotation.z = -0.22
  cane.castShadow = true
  cane.receiveShadow = true
  root.add(cane)
}

function addGrayHair(root: THREE.Group) {
  const hair = createBlock(0.66, 0.18, 0.66, makeMaterial(0xb8b8b8, 0.86))
  hair.position.y = 2.79
  root.add(hair)
}

function addBeard(root: THREE.Group) {
  const beardMat = makeMaterial(0x8f8f8f, 0.88)
  const beard = createBlock(0.5, 0.34, 0.12, beardMat)
  beard.position.set(0, 2.2, 0.34)
  root.add(beard)

  const chin = createBlock(0.34, 0.16, 0.14, beardMat)
  chin.position.set(0, 2.02, 0.32)
  root.add(chin)
}

function createPersonRig({
  name,
  base,
  scale = 1,
  hunch = 0,
  speed = 1,
  stride = 1,
  bob = 1,
  grayHair = false,
  cane = false,
  beard = false,
}: {
  name: string
  base: THREE.Vector3
  scale?: number
  hunch?: number
  speed?: number
  stride?: number
  bob?: number
  grayHair?: boolean
  cane?: boolean
  beard?: boolean
}): PersonRig {
  const root = new THREE.Group()
  root.name = name
  root.scale.setScalar(scale)

  const skin = makeMaterial(0xff1493)
  const shirt = makeMaterial(randomShirtColor())
  const pants = makeMaterial(PANTS_COLOR)

  const body = createBlock(0.72, 1.05, 0.42, shirt)
  body.position.y = 1.6
  root.add(body)

  const head = createBlock(0.62, 0.62, 0.62, skin)
  head.position.y = 2.44
  root.add(head)

  if (grayHair) addGrayHair(root)
  if (beard) addBeard(root)
  if (cane) addCane(root)

  const leftArm = createLimb('left arm', 0.76, 0.18, shirt)
  leftArm.position.set(-0.49, 1.96, 0)
  leftArm.rotation.z = -0.13
  root.add(leftArm)

  const rightArm = createLimb('right arm', 0.76, 0.18, shirt)
  rightArm.position.set(0.49, 1.96, 0)
  rightArm.rotation.z = 0.13
  root.add(rightArm)

  const leftLeg = createLimb('left leg', 0.84, 0.22, pants)
  leftLeg.position.set(-0.22, 1.08, 0)
  root.add(leftLeg)

  const rightLeg = createLimb('right leg', 0.84, 0.22, pants)
  rightLeg.position.set(0.22, 1.08, 0)
  root.add(rightLeg)

  return {
    root,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    base,
    phase: Math.random() * Math.PI * 2,
    speed,
    stride,
    hunch,
    bob,
  }
}

function createCarRig(base: THREE.Vector3): CarRig {
  const root = new THREE.Group()
  root.name = 'ai4animationpy car model'
  root.scale.setScalar(1.75)

  const carMat = makeMaterial(0xe84c3d, 0.72)
  const bumperMat = makeMaterial(0xd3362d, 0.76)
  const darkMat = makeMaterial(0x14181f, 0.8)
  const glassMat = makeMaterial(0x78c8f2, 0.42)
  const lightMat = makeMaterial(0xfff2a6, 0.55)
  const tailMat = makeMaterial(0x9b1e26, 0.55)

  const body = createBlock(2.34, 0.48, 1.04, carMat)
  body.position.y = 0.58
  root.add(body)

  const hood = createBlock(0.82, 0.22, 0.96, bumperMat)
  hood.position.set(0.72, 0.89, 0)
  root.add(hood)

  const trunk = createBlock(0.5, 0.18, 0.94, bumperMat)
  trunk.position.set(-0.9, 0.87, 0)
  root.add(trunk)

  const cabinBack = createBlock(0.82, 0.56, 0.84, glassMat)
  cabinBack.position.set(-0.2, 1.08, 0)
  root.add(cabinBack)

  const windshield = createBlock(0.08, 0.42, 0.76, darkMat)
  windshield.position.set(0.28, 1.12, 0)
  windshield.rotation.z = -0.28
  root.add(windshield)

  const rearWindow = createBlock(0.08, 0.34, 0.72, darkMat)
  rearWindow.position.set(-0.68, 1.08, 0)
  rearWindow.rotation.z = 0.22
  root.add(rearWindow)

  const sideWindowLeft = createBlock(0.5, 0.3, 0.05, darkMat)
  sideWindowLeft.position.set(-0.2, 1.13, 0.45)
  root.add(sideWindowLeft)

  const sideWindowRight = sideWindowLeft.clone()
  sideWindowRight.position.z = -0.45
  root.add(sideWindowRight)

  const headlights = [-0.31, 0.31].map(z => {
    const light = createBlock(0.08, 0.12, 0.18, lightMat)
    light.position.set(1.22, 0.62, z)
    root.add(light)
    return light
  })

  const taillights = [-0.31, 0.31].map(z => {
    const light = createBlock(0.08, 0.12, 0.18, tailMat)
    light.position.set(-1.22, 0.62, z)
    root.add(light)
    return light
  })

  const wheels = [-0.78, 0.78].flatMap(x =>
    [-0.58, 0.58].map(z => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 10), darkMat)
      wheel.position.set(x, 0.34, z)
      wheel.rotation.x = Math.PI / 2
      wheel.castShadow = true
      wheel.receiveShadow = true
      root.add(wheel)
      return wheel
    })
  )

  headlights.concat(taillights).forEach(light => {
    light.castShadow = false
  })

  return { root, wheels, base }
}

function createShowcaseRigs(groupCount: number) {
  const rigs: ShowcaseRig[] = []

  rigs.push({
    kind: 'person',
    person: createPersonRig({
      name: 'simple walker',
      base: new THREE.Vector3(-4.9, 0, -0.4),
    }),
  })

  rigs.push({
    kind: 'person',
    person: createPersonRig({
      name: 'old person',
      base: new THREE.Vector3(-2.5, 0, -0.2),
      scale: 0.9,
      hunch: -0.32,
      speed: 0.58,
      stride: 0.52,
      bob: 0.55,
      grayHair: true,
      cane: true,
      beard: true,
    }),
  })

  rigs.push({
    kind: 'person',
    person: createPersonRig({
      name: 'jogger',
      base: new THREE.Vector3(-0.35, 0, -0.25),
      scale: 0.96,
      speed: 1.8,
      stride: 1.42,
      bob: 1.35,
    }),
  })

  rigs.push({
    kind: 'car',
    car: createCarRig(new THREE.Vector3(1.85, 0, -0.45)),
  })

  const people = Array.from({ length: groupCount }, (_, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    return createPersonRig({
      name: `group walker ${index + 1}`,
      base: new THREE.Vector3(3.55 + column * 0.82, 0, -0.92 + row * 0.82),
      scale: 0.78 + Math.random() * 0.18,
      speed: 0.82 + Math.random() * 0.34,
      stride: 0.78 + Math.random() * 0.34,
      bob: 0.8 + Math.random() * 0.28,
    })
  })

  rigs.push({ kind: 'group', people })

  return rigs
}

function applyPersonFrame(person: PersonRig, frame: WalkFrame, elapsed: number) {
  const localStride = Math.sin(elapsed * person.speed * 2.8 + person.phase) * 0.24
  person.root.position.set(person.base.x + localStride, frame.root[1] * person.bob, person.base.z)
  person.root.rotation.y = Math.sin(elapsed * 0.55 + person.phase) * 0.08
  person.root.rotation.z = frame.bodyTilt * 0.45
  person.body.rotation.x = person.hunch + frame.bodyTilt * 0.4
  person.head.rotation.x = person.hunch * 0.65 + Math.sin(frame.time * 2.2 + person.phase) * 0.025
  person.head.rotation.z = frame.headTilt * 0.5
  person.leftArm.rotation.x = frame.leftArm * person.stride
  person.rightArm.rotation.x = frame.rightArm * person.stride
  person.leftLeg.rotation.x = frame.leftLeg * person.stride
  person.rightLeg.rotation.x = frame.rightLeg * person.stride
}

function applyCarFrame(car: CarRig, elapsed: number) {
  car.root.position.set(
    car.base.x + Math.sin(elapsed * 0.85) * 0.42,
    car.base.y + 0.02 * Math.sin(elapsed * 5),
    car.base.z
  )
  car.root.rotation.y = Math.sin(elapsed * 0.65) * 0.08
  car.wheels.forEach(wheel => {
    wheel.rotation.y -= 0.12
  })
}

function createPathLine() {
  const points = [
    new THREE.Vector3(-5.75, 0.025, 0.85),
    new THREE.Vector3(-3.2, 0.025, 0.95),
    new THREE.Vector3(-0.5, 0.025, 0.8),
    new THREE.Vector3(2.35, 0.025, 0.7),
    new THREE.Vector3(5.7, 0.025, 0.75),
  ]

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 })
  return new THREE.Line(geometry, material)
}

function createOohModels({ billboardOnly = false }: { billboardOnly?: boolean } = {}) {
  const metal = makeMaterial(0x2f3a40, 0.68)
  const shelterMetal = makeMaterial(0x31464f, 0.7)
  const roofMat = makeMaterial(0x25343c, 0.76)
  const posterFrame = makeMaterial(0x1d252b, 0.72)
  const billboardCreative = makeDisplayMaterial(0x3f88ff)
  const shelterCreative = makeDisplayMaterial(0xffd166)
  const posterCreative = makeDisplayMaterial(0xf472b6)

  const root = new THREE.Group()
  root.name = 'OOH media models'

  const billboard = new THREE.Group()
  billboard.name = 'billboard model'
  billboard.position.set(billboardOnly ? 0 : -4.15, 0, billboardOnly ? 0 : 2.66)
  billboard.rotation.y = billboardOnly ? 0 : -0.13
  billboard.scale.setScalar(billboardOnly ? 1.74 : 1.42)

  const billboardPoleLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.9, 5), metal)
  billboardPoleLeft.position.set(-0.7, 0.95, 0)
  const billboardPoleRight = billboardPoleLeft.clone()
  billboardPoleRight.position.x = 0.7
  const billboardBack = createBlock(2.55, 1.15, 0.1, metal)
  billboardBack.position.y = 2.25
  const billboardFace = createDisplayPanel(2.35, 0.94, billboardCreative)
  billboardFace.position.set(0, 2.25, 0.058)
  billboard.add(billboardPoleLeft, billboardPoleRight, billboardBack, billboardFace)

  const shelter = new THREE.Group()
  shelter.name = 'bus shelter model'
  shelter.position.set(-0.15, 0, 2.38)
  shelter.rotation.y = -0.05
  shelter.scale.setScalar(1.28)

  const shelterRoof = createBlock(2.3, 0.14, 0.95, roofMat)
  shelterRoof.position.y = 1.75
  const bench = createBlock(1.45, 0.18, 0.32, shelterMetal)
  bench.position.set(-0.18, 0.55, -0.15)
  const shelterBack = createBlock(2.0, 1.15, 0.06, makeMaterial(0x9ad7e8, 0.5))
  shelterBack.position.set(0, 1.11, -0.46)
  const shelterPanelFrame = createBlock(0.72, 1.12, 0.08, shelterMetal)
  shelterPanelFrame.position.set(0.83, 1.04, 0.08)
  const shelterFace = createDisplayPanel(0.58, 0.94, shelterCreative)
  shelterFace.position.set(0.83, 1.04, 0.128)
  const shelterPosts = [-0.94, 0.94].map(x => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 5), shelterMetal)
    post.position.set(x, 0.78, 0.36)
    post.castShadow = true
    return post
  })
  shelter.add(shelterRoof, bench, shelterBack, shelterPanelFrame, shelterFace, ...shelterPosts)

  const poster = new THREE.Group()
  poster.name = 'poster model'
  poster.position.set(5.28, 0, 1.72)
  poster.rotation.y = 0.08
  poster.scale.setScalar(1.38)

  const posterStand = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.74, 5), posterFrame)
  posterStand.position.y = 0.37
  posterStand.castShadow = true
  const posterBack = createBlock(0.84, 1.24, 0.08, posterFrame)
  posterBack.position.y = 1.16
  const posterFace = createDisplayPanel(0.68, 1.06, posterCreative)
  posterFace.position.set(0, 1.16, 0.052)
  poster.add(posterStand, posterBack, posterFace)

  if (billboardOnly) {
    root.add(billboard)
  } else {
    root.add(billboard, shelter, poster)
  }

  return {
    root,
    surfaces: {
      billboard: billboardFace,
      shelter: shelterFace,
      poster: posterFace,
    },
  } satisfies { root: THREE.Group; surfaces: Record<MediaTarget, THREE.Mesh> }
}

interface LowPolyWalkerProps {
  externalMediaUrl?: string
  externalMediaType?: 'image' | 'video'
  hideControls?: boolean
  billboardOnly?: boolean
}

export default function LowPolyWalker({ externalMediaUrl, externalMediaType = 'image', hideControls = false, billboardOnly = false }: LowPolyWalkerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const applyMediaRef = useRef<((target: MediaTarget, file: File) => void) | null>(null)
  const applyUrlRef   = useRef<((target: MediaTarget, url: string, type: 'image' | 'video') => void) | null>(null)
  const [mediaTarget, setMediaTarget] = useState<MediaTarget>('billboard')
  const [mediaName, setMediaName] = useState('No creative loaded')
  const [status, setStatus] = useState('Loading AI4AnimationPy walk clip...')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let animationId = 0
    const groupCount = billboardOnly ? 0 : 3 + Math.floor(Math.random() * 5)
    const clock = new THREE.Clock()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(billboardOnly ? 0x05090c : 0x071014)
    scene.fog = billboardOnly ? null : new THREE.Fog(0x071014, 8, 20)

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 80)
    camera.position.set(billboardOnly ? 0 : 7.55, billboardOnly ? 2.75 : 4.75, billboardOnly ? 8.15 : 7.55)

    const hemi = new THREE.HemisphereLight(0xcfeee9, 0x091216, 1.65)
    scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xffdf8a, 4.5)
    sun.position.set(3.4, 7.6, 2.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 20
    sun.shadow.camera.left = -9
    sun.shadow.camera.right = 9
    sun.shadow.camera.top = 9
    sun.shadow.camera.bottom = -9
    scene.add(sun)

    const rim = new THREE.DirectionalLight(0x5bd6ff, 2.25)
    rim.position.set(-5, 4.2, -4.6)
    scene.add(rim)

    const billboardGlow = new THREE.PointLight(0xf0c020, 3.2, 7.5)
    billboardGlow.position.set(-4.1, 2.8, 2.9)
    scene.add(billboardGlow)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(8.8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x19342e,
        roughness: 0.82,
        metalness: 0.04,
        flatShading: true,
      })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    if (!billboardOnly) scene.add(ground)

    const stageRing = new THREE.Mesh(
      new THREE.RingGeometry(3.7, 3.76, 96),
      new THREE.MeshBasicMaterial({ color: 0xf0c020, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    )
    stageRing.rotation.x = -Math.PI / 2
    stageRing.position.y = 0.035
    if (!billboardOnly) scene.add(stageRing)

    const cityGlow = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 48),
      new THREE.MeshBasicMaterial({ color: 0x1d5b64, transparent: true, opacity: 0.18 })
    )
    cityGlow.rotation.x = -Math.PI / 2
    cityGlow.position.y = 0.03
    if (!billboardOnly) scene.add(cityGlow)

    if (!billboardOnly) {
      const hillMat = makeMaterial(0x24483f)
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2
        const hill = new THREE.Mesh(new THREE.ConeGeometry(0.36 + (i % 3) * 0.08, 0.78, 5), hillMat)
        hill.position.set(Math.cos(angle) * 6.9, 0.37, Math.sin(angle) * 6.1)
        hill.castShadow = true
        scene.add(hill)
      }
    }

    const rigs = billboardOnly ? [] : createShowcaseRigs(groupCount)
    rigs.forEach(rig => {
      if (rig.kind === 'person') scene.add(rig.person.root)
      if (rig.kind === 'car') scene.add(rig.car.root)
      if (rig.kind === 'group') rig.people.forEach(person => scene.add(person.root))
    })

    const focus = billboardOnly ? new THREE.Vector3(0, 2.35, 0) : new THREE.Vector3(0.3, 1.15, -0.15)
    const oohModels = createOohModels({ billboardOnly })
    const activeMedia: Partial<Record<MediaTarget, {
      material: THREE.MeshStandardMaterial
      texture: THREE.Texture
      url: string
      video?: HTMLVideoElement
    }>> = {}

    const cleanupMedia = (target: MediaTarget) => {
      const media = activeMedia[target]
      if (!media) return

      media.video?.pause()
      media.texture.dispose()
      media.material.dispose()
      URL.revokeObjectURL(media.url)
      delete activeMedia[target]
    }

    const applyMedia = (target: MediaTarget, file: File) => {
      cleanupMedia(target)

      const surface = oohModels.surfaces[target]
      const url = URL.createObjectURL(file)
      const material = new THREE.MeshStandardMaterial({
        roughness: 0.48,
        metalness: 0.02,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.22,
      })

      let texture: THREE.Texture
      let video: HTMLVideoElement | undefined

      if (file.type.startsWith('video/')) {
        video = document.createElement('video')
        video.src = url
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.autoplay = true
        void video.play()

        texture = new THREE.VideoTexture(video)
      } else {
        texture = new THREE.TextureLoader().load(url)
      }

      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      material.map = texture
      material.emissiveMap = texture
      surface.material = material
      activeMedia[target] = { material, texture, url, video }
    }

    const applyMediaUrl = (target: MediaTarget, url: string, type: 'image' | 'video') => {
      cleanupMedia(target)

      const surface = oohModels.surfaces[target]
      const material = new THREE.MeshStandardMaterial({
        roughness: 0.48,
        metalness: 0.02,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.22,
      })

      let texture: THREE.Texture
      let video: HTMLVideoElement | undefined

      if (type === 'video') {
        video = document.createElement('video')
        video.src = url
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.autoplay = true
        void video.play()
        texture = new THREE.VideoTexture(video)
      } else {
        texture = new THREE.TextureLoader().load(url)
      }

      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      material.map = texture
      material.emissiveMap = texture
      surface.material = material
      activeMedia[target] = { material, texture, url, video }
    }

    applyMediaRef.current = applyMedia
    applyUrlRef.current = applyMediaUrl
    scene.add(oohModels.root)
    if (!billboardOnly) scene.add(createPathLine())

    if (billboardOnly) {
      const orbitRadius = Math.sqrt(0 * 0 + 8.15 * 8.15)
      const orbitY = 2.75
      const orbitSpeed = 0.18
      const animate = () => {
        const elapsed = clock.getElapsedTime()
        camera.position.set(
          Math.sin(elapsed * orbitSpeed) * orbitRadius,
          orbitY,
          Math.cos(elapsed * orbitSpeed) * orbitRadius,
        )
        camera.lookAt(focus)
        renderer.render(scene, camera)
        animationId = window.requestAnimationFrame(animate)
      }
      animate()
    } else {
      fetch(WALK_DATA_URL)
        .then(async res => {
          if (!res.ok) throw new Error(`Walk clip failed with status ${res.status}`)
          return await res.json() as WalkClip
        })
        .then(clip => {
          if (disposed) return
          setStatus(`${clip.frames.length} AI4AnimationPy frames loaded | car model active`)

          const animate = () => {
            const elapsed = clock.getElapsedTime()
            const frameIndex = Math.floor((elapsed * clip.fps) % clip.frames.length)
            const frame = clip.frames[frameIndex]

            rigs.forEach(rig => {
              if (rig.kind === 'person') applyPersonFrame(rig.person, frame, elapsed)
              if (rig.kind === 'car') applyCarFrame(rig.car, elapsed)
              if (rig.kind === 'group') {
                rig.people.forEach((person, index) => {
                  const shiftedFrame = clip.frames[(frameIndex + index * 9) % clip.frames.length]
                  applyPersonFrame(person, shiftedFrame, elapsed + index * 0.28)
                })
              }
            })

            camera.lookAt(focus)
            renderer.render(scene, camera)
            animationId = window.requestAnimationFrame(animate)
          }

          animate()
        })
        .catch(error => {
          setStatus(error instanceof Error ? error.message : 'Walk clip unavailable')
        })
    }

    const handleResize = () => {
      if (!mount) return
      const width = mount.clientWidth
      const height = mount.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      applyMediaRef.current = null
      applyUrlRef.current = null
      ;(Object.keys(activeMedia) as MediaTarget[]).forEach(cleanupMedia)
      window.cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [billboardOnly])

  useEffect(() => {
    if (externalMediaUrl) {
      applyUrlRef.current?.('billboard', externalMediaUrl, externalMediaType)
    }
  }, [externalMediaUrl, externalMediaType])

  const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    applyMediaRef.current?.(mediaTarget, file)
    setMediaName(`${MEDIA_TARGET_LABELS[mediaTarget]}: ${file.name}`)
    event.currentTarget.value = ''
  }

  return (
    <main className="walker-scene">
      <div ref={mountRef} className="walker-canvas" />
      {!hideControls && (
        <section className="walker-hud" aria-label="Scene details">
          <p>AI4AnimationPy</p>
          <h1>Low-Poly Model Set</h1>
          <span>{status}</span>
          <div className="walker-media">
            <select
              aria-label="Creative target"
              value={mediaTarget}
              onChange={event => setMediaTarget(event.currentTarget.value as MediaTarget)}
            >
              <option value="billboard">Billboard</option>
              <option value="shelter">Bus Shelter</option>
              <option value="poster">Poster</option>
            </select>
            <label>
              <input accept="image/*,video/*" type="file" onChange={handleMediaChange} />
              <span>Load Media</span>
            </label>
            <small>{mediaName}</small>
          </div>
        </section>
      )}
    </main>
  )
}
