# Faultline

> **An AI agent that replans your city after a disaster — before reality gets a vote.**

---

## The Problem

Cities are planned reactively. Disasters are managed after the fact.

Every year, urban flooding, infrastructure collapse, and climate events cost governments and communities hundreds of billions of dollars in damage, displacement, and emergency response. And yet, most urban planning decisions — where to build, what to reinforce, how to evacuate — are made without ever running a simulation of what would actually happen under stress.

The tools that do exist are expensive, slow, siloed in academic or government systems, and require specialist operators. There is no accessible, AI-native platform that lets a city planner ask: *"If this district flooded tonight, who would be affected, where would the system break, and what would actually fix it?"*

**That question should take minutes to answer. Right now, it takes months.**

---

## The Real Cost

### Globally

Natural disasters caused **$280B in economic losses in 2023 alone** (Munich Re). Flooding accounts for the largest share — more than earthquakes, storms, and wildfires combined. It is the most frequent, most widespread, and most preventable class of natural disaster.

Over **1.8 billion people** — roughly 23% of the world's population — live in areas exposed to significant flood risk. As climate change intensifies rainfall events and accelerates sea level rise, that number is growing. Cities in Asia-Pacific are disproportionately exposed: the region accounts for over **40% of global disaster losses** and roughly **70% of disaster-related deaths** annually.

The economic damage figures also systematically undercount the real cost. They do not capture the long-term displacement, the disruption to health and education infrastructure, the loss of livelihoods, or the compounding effect of repeated flood events on communities that never fully recover between cycles.

### Singapore

Singapore sits at sea level, receives **2,400mm of rainfall per year** — nearly double London's annual total — and is fully urbanised with large areas of impermeable surface. Despite world-class drainage infrastructure and over S$2B invested in flood mitigation since 2011, flash flooding remains a live and recurring threat.

**Typhoon Vamei (December 2001)** remains Singapore's most significant natural disaster on record. It was the first tropical cyclone ever recorded within 1.5° of the equator, a meteorological event previously considered near-impossible. Vamei made landfall directly over Johor and grazed Singapore's northern coast, causing widespread flooding, structural damage, and naval vessel losses. It was a statistical anomaly — until climate modelling began suggesting such events would become less anomalous.

Since then, Singapore has experienced repeated high-profile urban floods: Orchard Road inundated in **2010 and 2011**, Bukit Timah Canal breaching in **2021**, and over **170 flash flood incidents per year** on average recorded by PUB across the island. The government's own projections anticipate **mean sea levels rising 0.23m–1m by 2100**, with more intense and less predictable rainfall patterns in between.

The risk is not hypothetical. It is already priced into infrastructure budgets, insurance actuarial tables, and long-range urban master plans. What is missing is the ability to simulate it interactively — to run *this scenario, in this district, with these interventions* — before committing to a course of action.

---

## What We Built

Faultline is an AI city replanning agent. You run a flood scenario, and an AI agent autonomously analyses the damage, proposes a ranked set of infrastructure interventions, tests each one against the simulation, and delivers a justified action plan — the kind of analysis that normally takes a specialist team months to produce.

The simulation is the environment the agent operates in. The product is the plan it produces.

The workflow has three stages:

1. **Simulate** — run a flood scenario over a photorealistic 3D model of the city, enriched with real buildings, roads, population, and transit data
2. **Analyse** — the AI agent assesses impact across the affected zone: who is at risk, where the system breaks, what the damage costs
3. **Replan** — the agent autonomously tests intervention combinations, ranks them by impact per dollar, and presents a prioritised infrastructure recommendation with its reasoning shown

The first scenario is urban flooding. The architecture is scenario-agnostic.

---

## How It Works

### 1. City Enrichment

Select any area on the map. Faultline pulls live city data from OpenStreetMap, Overture Maps, and LTA APIs — buildings with footprints, heights, and use categories; roads classified by type; vegetation; transit nodes; street fixtures. No manual data entry, no preprocessing. This becomes the environment the agent reasons over.

### 2. Flood Simulation

A depth-raster engine propagates flood water across the terrain, constrained by real building geometry and road topology. Water advances minute by minute. This gives the agent a concrete, quantified damage state to reason from — not a static map, but a dynamic event with a timeline.

### 3. Impact Assessment

Every building in the affected zone is assessed for occupancy and damage. The agent builds a structured picture of the situation:

- Total affected people and vulnerable cohorts (elderly, mobility-limited, children)
- Buildings by damage severity and floor count
- Roads blocked, mobility loss as a percentage of district connectivity
- Estimated financial damage
- A composite resilience score

### 4. Evacuation Behaviour

Synthetic agents — each carrying a persona with role, mobility, risk tolerance, and decision delay — attempt to evacuate from affected buildings. Their outcomes (safe, delayed, stranded) make the cost of infrastructure gaps concrete: not just "X buildings flooded" but "these specific people didn't make it because this route was blocked."

### 5. Agentic Replanning

This is the core of the product. Given the damage state and a budget constraint, the AI planner agent:

- Identifies the highest-leverage intervention zones from the impact data
- Proposes an initial set of infrastructure interventions with placement rationale
- Iteratively tests each combination against the simulation
- Ranks options by lives protected, mobility restored, and damage avoided per dollar
- Presents a final prioritised plan with its reasoning shown at each step

The agent uses tool calls to place interventions, re-run the simulation, and evaluate outcomes — the same loop a human planner would run manually, compressed from months into minutes.

Available interventions:

| Intervention | Effect |
|---|---|
| Flood barrier | Blocks water propagation along defined perimeters |
| Retention pond | Absorbs inflow, reduces downstream depth |
| Green corridor | Increases absorption along drainage paths |
| Elevated road | Maintains mobility above flood level |
| Shelter node | Provides safe evacuation destination |
| Protected route | Keeps evacuation paths passable |

### 6. Before / After Comparison

Baseline versus agent-recommended scenario, side by side — every metric quantified, every tradeoff visible. The output is a structured intervention brief the planner can take into a real decision-making process.

---

## Why This Matters

**Climate risk is accelerating.** Urban flooding events have increased in frequency and severity across Asia-Pacific, Europe, and North America. Cities designed for 20-year flood events are now experiencing them annually.

**Planning tools haven't kept up.** The dominant workflow for urban resilience planning involves static GIS layers, expensive specialist consultancies, and reports that take months to produce and are obsolete before they're delivered. None of it is interactive. None of it tests interventions before they're built.

**The bottleneck isn't data — it's analysis.** Cities have the data. What they lack is the ability to rapidly explore "what would fix this?" across dozens of intervention options, budget scenarios, and risk profiles. That's exactly what an agent is good at.

**Faultline makes the agent the product.** Not a dashboard. Not a visualiser. An AI that takes a damage scenario and returns a ranked, justified infrastructure plan — the same output that previously required a specialist team and a six-month engagement, available in a single session.

**Singapore is the right starting point.** Dense urban fabric, advanced LTA open data, known flood risk zones, and a government that actively invests in smart city infrastructure. The data story is ready. The use case is validated.

---

## Data Sources

| Source | Role |
|---|---|
| OpenStreetMap / Overpass API | Buildings, roads, vegetation, street fixtures, POIs |
| Overture Maps | High-fidelity building footprints and infrastructure geometry |
| Mapbox | Base cartography, 3D rendering, static imagery |
| LTA Singapore | Bus stop activity, transit nodes, foot traffic indices |
| Open-Meteo | Real-time weather — environmental context for simulation |
| Anthropic (Claude) | AI replanning agent — intervention testing, ranking, plan synthesis, evacuation persona reasoning |
| OpenAI | Scene analysis, impact narration |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| 3D / Visualization | Mapbox GL, Deck.gl, Three.js, GSAP |
| Simulation Engine | Client-side raster flood propagation, custom geometry intersection |
| AI / Agents | Claude (Anthropic) — agentic replanning loop with tool use; OpenAI GPT-4o — scene analysis |
| Geospatial | react-map-gl, Overpass API, Overture GeoParquet |
| Reporting | React-PDF — structured impact reports with maps, tables, and intervention analysis |
| Infrastructure | Next.js API routes, server-side data enrichment and AI orchestration |

---

## Market

The global urban resilience and disaster risk management market is large, structurally underfunded relative to the risk, and actively seeking better tools.

- **$280B+** in disaster-related economic losses annually across APAC alone (World Bank)
- **$100B+** committed globally by governments to climate adaptation infrastructure through 2030
- **Smart city planning tools** are a fast-growing procurement category — but most available products are GIS-heavy, expensive, and inaccessible outside large municipal IT departments

Faultline's edge is the agent. The same intervention analysis that previously required a specialist team and a multi-month engagement runs autonomously in a single session — with the reasoning shown at every step, not just the conclusion. That changes who can afford to plan proactively, and how often.

The platform is built to extend beyond flooding. The city enrichment pipeline, simulation substrate, and agent framework apply to any scenario: earthquake evacuation, infrastructure failure, extreme heat, crowd crush. Flood is v1. The architecture is scenario-agnostic.

---

## Getting Started

```bash
git clone https://github.com/[handle]/[repo]
cd [repo]
npm install
# Configure .env.local:
#   NEXT_PUBLIC_MAPBOX_TOKEN
#   OPENAI_API_KEY
#   ANTHROPIC_API_KEY
npm run dev
```

Open `http://localhost:3000` for the landing page.  
Navigate to `/map` to open the simulation console.

---

