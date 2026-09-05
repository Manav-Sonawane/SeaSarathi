# SeaSarathi (सागर सारथी) - Marine Intelligence Platform

> **India-Specific Agentic Marine Intelligence & Safety System for Fishermen & Coastal Stakeholders**

SeaSarathi is an AI-powered marine intelligence platform designed to empower Indian fishermen and coastal authorities with real-time safety assessments, Potential Fishing Zone (PFZ) recommendations, marine weather visualizations, geofence alerts, and marine route optimization.

Powered by **Sarvam-105B** for multilingual intelligence (English, Hindi, Tamil) and **LangGraph** multi-agent workflow orchestration, SeaSarathi fuses satellite oceanography (Copernicus Marine Service), weather models (Open-Meteo, IMD), and spatial calculations into an explainable decision support system.

---

## 🌟 Key Features

- **🤖 Multilingual Agentic Chat & Voice**: Auto-detects user language (English, Hindi, Tamil) with Sarvam-105B LLM for natural, conversational queries and voice synthesis.
- **🛡️ Real-Time Safety Assessment**: Deterministic safety rules engine evaluating wind speeds, wave heights, swell, and cyclone warnings from IMD/INCOIS (`SAFE`, `CAUTION`, or `DO NOT VENTURE`).
- **🐟 Potential Fishing Zone (PFZ) Recommendations**: Identifies optimal fishing locations based on 52 static coastal zones, Copernicus chlorophyll/SST levels, safety status, accessibility, and historical averages.
- **🗺️ Interactive Marine Weather & Data Dashboard**: Visualizes SST (Sea Surface Temperature), Chlorophyll distribution, wave height vectors, and IMD cyclone tracking paths with interactive Leaflet map layers.
- **🚨 Boundary & Geofencing Alerts**: Proximity warnings for India EEZ (200 nm), international maritime boundaries (Pakistan, Sri Lanka), Marine Protected Areas (MPAs), and port restricted zones.
- **🧭 Marine Route Optimization**: A* pathfinding over marine cost grids that avoids high wave risks, cyclone warning cones, and restricted maritime boundaries.
- **🔍 Explainable Decision Support**: Clear data provenance, confidence scores, source timestamps (IMD, Copernicus, INCOIS), and reasoning chains for every recommendation.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 18 + Vite + TS)          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Chat UI  │  │ Map View │  │ Voice UI │  │ Dashboard│     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓ (REST API / JSON)
┌─────────────────────────────────────────────────────────────┐
│            FastAPI Server (Python) - Port 8000              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              LangGraph Agent Orchestration           │   │
│  │                                                      │   │
│  │  ┌────────────┐      ┌────────────┐                  │   │
│  │  │  Planner   │─────→│ Router →   │                  │   │
│  │  │(Sarvam-105B)      │Intent→Agent│                  │   │
│  │  └────────────┘      └────────────┘                  │   │
│  │        ↓        ↓        ↓        ↓                  │   │
│  │  ┌────────┐ ┌────┐ ┌────────┐ ┌────────┐             │   │
│  │  │ Data   │ │Geo │ │ Risk   │ │Response│             │   │
│  │  │ Agent  │ │Agent││ Agent  │ │ Agent  │             │   │
│  │  └────────┘ └────┘ └────────┘ └────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │ 
│  │              External Data & Storage                 │   │
│  │  Copernicus (SST/Chl) │ Open-Meteo │ IMD API         │   │
│  │  PostgreSQL + PostGIS │ Redis Cache                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, LangGraph, LangChain, Pydantic, GeoPandas, Shapely, NumPy, SciPy
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Axios, Leaflet / Mapbox GL JS
- **AI & Translation**: Sarvam AI (Sarvam-105B, Sarvam Translate, STT, Bulbul TTS)
- **Database & Cache**: PostgreSQL with PostGIS extension, Redis
- **Data Providers**: Copernicus Marine Service, Open-Meteo, IMD (India Meteorological Department), INCOIS

---

## 📁 Repository Structure

```
SeaSarathi/
├── backend/                  # FastAPI backend & LangGraph agents
│   ├── src/
│   │   ├── agents/           # Planner, Data, Risk/Safety, Response agents & State graph
│   │   ├── services/         # Copernicus, Open-Meteo, IMD API integrations
│   │   ├── tools/            # Haversine distance, A* router, geofencing rules engine
│   │   └── main.py           # FastAPI entrypoint & endpoints (/health, /chat)
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # Backend environment variables (uncommitted)
├── frontend/                 # React + Vite TypeScript frontend
│   ├── src/
│   │   ├── components/       # Chat, Map, Dashboard, Navigation components
│   │   ├── services/         # Axios API client setup
│   │   └── App.tsx           # Main application routing & layout
│   ├── package.json          # Frontend dependencies & scripts
│   └── .env                  # Frontend environment variables (uncommitted)
├── data/                     # Marine datasets & spatial boundaries
│   ├── static/               # 52 PFZ zones GeoJSON, maritime boundaries, MPAs
│   └── dynamic/              # Daily SST/Chlorophyll cache & weather forecasts
├── .agents/                  # Custom rules & guidelines for agentic IDEs
│   └── rules/                # Execution & PRD rule specifications
├── execution.md              # 5-Day Execution Plan & Team Workflow
├── prd.md                    # Product Requirements Document & Specifications
├── CLAUDE.md                 # Development & project standards
└── README.md                 # Project documentation (this file)
```

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- **Node.js**: v18.0+ & `npm`
- **Python**: v3.10+
- **Database (Optional)**: PostgreSQL 14+ with PostGIS (SQLite supported for local development fallback)

---

### 2. Environment Configuration

#### Backend Setup (`backend/.env`)
Create a `.env` file inside the `/backend` directory:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
SARVAM_LLM_MODEL=sarvam-105b
COPERNICUS_KEY=your_copernicus_key_here
IMD_API_KEY=your_imd_api_key_here
DATABASE_URL=postgresql://user:pass@localhost:5432/seasarathi
REDIS_URL=redis://localhost:6379
```

#### Frontend Setup (`frontend/.env`)
Create a `.env` file inside the `/frontend` directory:
```env
VITE_API_URL=http://localhost:8000
```

---

### 3. Running the Backend Server

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Install backend dependencies
pip install fastapi uvicorn httpx python-dotenv langgraph langchain pydantic geopandas shapely

# Start FastAPI server in development mode
python -m uvicorn main:app --reload --port 8000
```
- API Health Check: Visit `http://localhost:8000/health` (Returns `{"status": "ok"}`)
- Swagger Documentation: Visit `http://localhost:8000/docs`

---

### 4. Running the Frontend Application

```bash
# Navigate to frontend directory
cd frontend

# Install node dependencies
npm install

# Start Vite development server
npm run dev
```
- Web Application: Visit `http://localhost:5173`

---

### 5. Data Files Setup

Ensure static GeoJSON data files are placed in `/data/static/`:
- `pfz_zones.geojson`: 52 potential fishing zones along the Indian coastline.
- `maritime_boundaries.geojson`: EEZ boundaries, international maritime boundary lines (Pakistan, Sri Lanka), and MPAs.

---

## ⚙️ Development Commands

| Command | Workspace Directory | Description |
|---------|---------------------|-------------|
| `npm install` | `/frontend` | Install frontend Node packages |
| `npm run dev` | `/frontend` | Launch Vite frontend dev server (:5173) |
| `npm test` | `/frontend` | Run frontend test suite |
| `python -m uvicorn main:app --reload` | `/backend` | Launch FastAPI backend server (:8000) |
| `pytest` | `/backend` | Run backend unit & integration tests |

---

## 📅 5-Day Execution Roadmap

- **Day 1: Foundation & Scaffold** — Repo structure, environment setup, FastAPI scaffold, React+Vite scaffold, Sarvam client validation.
- **Day 2: Core Agents & Data Integration** — LangGraph state graph setup, Planner agent, Copernicus/Open-Meteo/IMD tool integration, PFZ search algorithms.
- **Day 3: Map UI & Safety Engine** — Real-time deterministic safety engine, Leaflet/Mapbox dynamic layers, frontend-backend API integration.
- **Day 4: Route Optimization & Geofencing** — Marine A* pathfinder, maritime boundary warning system, multilingual Sarvam translation & voice synthesis.
- **Day 5: Polishing & End-to-End Demo** — Error resilience, caching, system tuning, user scenario validation, final demo readiness.

---

## 🤝 Team Roles

- **MNV**: Backend Architecture, LangGraph Multi-Agent Orchestration, Sarvam LLM Integration, Data Ingestion & Spatial Pathfinder.
- **ARP**: Frontend UI/UX (React + Vite + TypeScript), Interactive Map & Layer Controls, API Integration & Component Engineering.

---

## 📄 License & Acknowledgments

This project is built for marine safety and fisherman empowerment in India.
- **Data Providers**: [Copernicus Marine Service](https://marine.copernicus.eu/), [Open-Meteo](https://open-meteo.com/), [IMD](https://mausam.imd.gov.in/), [INCOIS](https://incois.gov.in/).
- **AI Infrastructure**: [Sarvam AI](https://www.sarvam.ai/).
