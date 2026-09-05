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
│                MOBILE APP (React Native + Expo)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │Chat Screen│ │Map Screen│  │PFZ Screen│  │Alerts    │     │
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
- **Mobile**: React Native, Expo, TypeScript, React Navigation (bottom tabs), react-native-maps, Axios, Zustand, AsyncStorage
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
├── mobile/                   # React Native (Expo) mobile app
│   ├── src/
│   │   ├── screens/          # ChatScreen, MapScreen, PFZScreen, AlertsScreen
│   │   ├── navigation/        # Bottom tab navigator
│   │   ├── services/          # Axios API client setup
│   │   └── theme/              # Design system colors
│   ├── App.tsx                # App entrypoint
│   ├── package.json           # Mobile app dependencies & scripts
│   └── .env                   # Mobile environment variables (uncommitted)
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
- **Expo Go app** (iOS/Android) or an emulator, for running the mobile app
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

#### Mobile Setup (`mobile/.env`)
Create a `.env` file inside the `/mobile` directory (see `mobile/.env.example`):
```env
EXPO_PUBLIC_API_URL=http://localhost:8000
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

### 4. Running the Mobile Application

```bash
# Navigate to mobile directory
cd mobile

# Install node dependencies
npm install

# Start the Expo dev server
npm start
```
- Scan the QR code with the **Expo Go** app (iOS/Android), or press `a`/`i` in the terminal to launch an Android/iOS emulator.

---

### 5. Data Files Setup

Ensure static GeoJSON data files are placed in `/data/static/`:
- `pfz_zones.geojson`: 52 potential fishing zones along the Indian coastline.
- `maritime_boundaries.geojson`: EEZ boundaries, international maritime boundary lines (Pakistan, Sri Lanka), and MPAs.

---

## ⚙️ Development Commands

| Command | Workspace Directory | Description |
|---------|---------------------|-------------|
| `npm install` | `/mobile` | Install mobile app Node packages |
| `npm start` | `/mobile` | Launch Expo dev server |
| `npm run android` / `npm run ios` | `/mobile` | Launch on Android/iOS |
| `python -m uvicorn main:app --reload` | `/backend` | Launch FastAPI backend server (:8000) |
| `pytest` | `/backend` | Run backend unit & integration tests |

---

## 📅 5-Day Execution Roadmap

- **Day 1: Foundation & Scaffold** — Repo structure, environment setup, FastAPI scaffold, React Native (Expo) scaffold with 4-tab navigation, Sarvam client validation.
- **Day 2: Core Agents & Chat Screen** — LangGraph state graph setup, Planner/Data/Risk/Response agents, `/chat` endpoint, mobile Chat screen wired to backend.
- **Day 3: Map & PFZ Screens** — `react-native-maps` integration with PFZ zone overlays, `/pfz/nearest` and `/geojson/*` endpoints, PFZ screen with nearest-zone cards.
- **Day 4: Alerts Screen & Risk Heatmap** — `/alerts` endpoint, geofencing/weather/cyclone alert cards, risk heatmap layer on the map.
- **Day 5: Polishing & End-to-End Demo** — Error resilience, caching, system tuning, user scenario validation, APK/IPA build, final demo readiness.

---

## 🤝 Team Roles

- **MNV**: Backend Architecture, LangGraph Multi-Agent Orchestration, Sarvam LLM Integration, Data Ingestion & Spatial Pathfinder.
- **ARP**: Mobile UI/UX (React Native + Expo + TypeScript), Interactive Map & Layer Controls, API Integration & Component Engineering.

---

## 📄 License & Acknowledgments

This project is built for marine safety and fisherman empowerment in India.
- **Data Providers**: [Copernicus Marine Service](https://marine.copernicus.eu/), [Open-Meteo](https://open-meteo.com/), [IMD](https://mausam.imd.gov.in/), [INCOIS](https://incois.gov.in/).
- **AI Infrastructure**: [Sarvam AI](https://www.sarvam.ai/).
