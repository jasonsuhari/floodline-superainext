'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'

const signalPhrases = [
  'Resilience twin',
  'Evacuation intelligence',
  'Infrastructure risk',
  'Capital works planning',
  'Disaster simulation',
  'Impact analysis',
  'City re-planning',
]

export default function ProtocolLanding() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.protocol-nav, .protocol-kicker, .protocol-title-word, .protocol-copy, .protocol-actions, .protocol-marquee, .protocol-globe-stage', {
        opacity: 0,
      })

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      timeline
        .to('.protocol-nav', { opacity: 1, y: 0, duration: 0.7 })
        .fromTo('.protocol-kicker', { y: 14 }, { opacity: 1, y: 0, duration: 0.55 }, '-=0.2')
        .fromTo('.protocol-title-word', { y: 80, rotateX: -28 }, { opacity: 1, y: 0, rotateX: 0, duration: 1.0 }, '-=0.1')
        .fromTo('.protocol-copy', { y: 18 }, { opacity: 1, y: 0, duration: 0.65 }, '-=0.35')
        .fromTo('.protocol-actions', { y: 16 }, { opacity: 1, y: 0, duration: 0.55 }, '-=0.35')
        .fromTo('.protocol-marquee', { y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
        .fromTo('.protocol-globe-stage', { scale: 0.82, y: 120 }, { opacity: 1, scale: 1, y: 0, duration: 1.2 }, '-=0.75')

      gsap.to('.protocol-reveal-word', {
        opacity: 1,
        y: 0,
        stagger: 0.035,
        duration: 0.5,
        delay: 1.05,
        ease: 'power2.out',
      })

      gsap.to('.protocol-image-wash', {
        scale: 1.08,
        opacity: 0.9,
        duration: 5.5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  const revealWords = 'Run the disaster, measure the blast radius, then redesign the city before reality gets a vote.'.split(' ')

  return (
    <main ref={rootRef} className="protocol-root overflow-x-hidden w-full max-w-full">
      <div className="protocol-noise" />
      <div className="protocol-image-wash" />
      <WireGlobe />

      <Link className="protocol-mark" href="/" aria-label="Return home">
        <Image src="/logo.png" alt="Faultline" width={120} height={36} priority />
      </Link>

      <nav className="protocol-nav">
        <div className="protocol-nav-links" aria-label="Platform areas">
          <span>Simulation</span>
          <span>Impact</span>
          <span>Re-planning</span>
        </div>
        <Link className="protocol-nav-action" href="/map">
          Open console
        </Link>
      </nav>

      <section className="protocol-hero" aria-labelledby="protocol-title">
        <p className="protocol-kicker">High-protocol urban resilience platform</p>
        <h1 id="protocol-title" className="protocol-title">
          <span className="protocol-title-word protocol-wordmark">
            <span className="protocol-wordmark-fault">FAULT</span><span className="protocol-wordmark-line">LINE</span>
          </span>
        </h1>
        <p className="protocol-copy" aria-label="Disaster simulation and city replanning summary">
          {revealWords.map((word, index) => (
            <span className="protocol-reveal-word" style={{ marginRight: '0.24em', whiteSpace: 'pre' }} key={`${word}-${index}`}>{word} </span>
          ))}
        </p>
        <div className="protocol-actions">
          <Link className="protocol-primary" href="/map">Enter live map</Link>
        </div>
      </section>

      <div className="protocol-marquee" aria-label="Platform signal">
        <div className="protocol-marquee-track">
          {[0, 1].map((setIndex) => (
            <div className="protocol-marquee-set" key={setIndex} aria-hidden={setIndex === 1}>
              {signalPhrases.map((phrase) => (
                <span className="protocol-marquee-unit" key={`${setIndex}-${phrase}`}>
                  <span className="protocol-marquee-phrase">{phrase}</span>
                  <i aria-hidden="true" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function WireGlobe() {
  return (
    <div className="protocol-globe-stage" aria-hidden="true">
      <div className="protocol-globe">
        <div className="protocol-globe-core">
          {Array.from({ length: 9 }).map((_, index) => (
            <span className="protocol-latitude" style={{ '--i': index } as CSSProperties} key={`lat-${index}`} />
          ))}
          {Array.from({ length: 12 }).map((_, index) => (
            <span className="protocol-meridian" style={{ '--i': index } as CSSProperties} key={`mer-${index}`} />
          ))}
          <span className="protocol-orbit protocol-orbit-one" />
          <span className="protocol-orbit protocol-orbit-two" />
        </div>
      </div>
    </div>
  )
}
