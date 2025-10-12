# 🚨 CrowdGuardian: Real-Time Stampede Risk Prediction System

**CrowdGuardian** is an intelligent, full-stack monitoring platform designed to enhance public safety at large gatherings by leveraging real-time crowd metrics and a Machine Learning (ML) model to predict high-risk stampede conditions and trigger immediate, geographically optimized evacuation routes.

-----

## ✨ Features

This project integrates three core components: real-time data visualization, predictive analytics, and dynamic spatial routing.

| Category | Feature | Description |
| :--- | :--- | :--- |
| **Real-Time Monitoring** | **Crowd Map** | Displays crowd density zones (Circles) and choke points (Markers) with color-coded risk levels based on live data. |
| | **Alerts Panel** | Real-time display of system alerts triggered by the ML model or choke point utilization. |
| **Intelligent System** | **Risk Prediction (ML)** | The backend executes a Python script containing a trained classifier (e.g., Random Forest) every 10 seconds to predict risk levels (`Low`, `Medium`, `High`, `Critical`). |
| | **Dynamic Evacuation** | If risk is predicted as 'High' or 'Critical', the system automatically calculates and emits a safe evacuation polyline using the **OSMnx routing algorithm**. |
| **Analytics** | **Historical Dashboard** | Visualizes past incident data (Time Series, Cause Distribution, Casualties) for long-term safety strategy. |

-----

## ⚙️ Architecture and Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | **React, Vite, CSS Modules** | Command Center UI and dashboard (features dark, emergency-themed design). |
| **Real-Time** | **Socket.IO (Client/Server)** | Enables immediate, bi-directional communication for risk alerts and evacuation routes. |
| **Backend** | **Node.js, Express, `child_process`** | REST API endpoints, prediction scheduler, and ML model executor. |
| **ML/GIS** | **Python 3, Scikit-learn, OSMnx** | Executes the pre-trained classification model and handles geographical routing. |
| **Database** | **PostgreSQL (pg)** | Stores historical incident data and real-time zone metrics. |

-----

## 🚀 Getting Started (Local Setup)

### Prerequisites

  * **Node.js** (v18+) and **npm**
  * **Python 3.10+** (managed via `pyenv`)
  * **PostgreSQL** (v14+) running locally.

### 1\. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/SwayamKohli/CrowdGuardian.git
cd CrowdGuardian/
```

**Create Environment File:**

In the `backend/` directory, create a file named **`.env`** and populate it with your actual PostgreSQL credentials:

```bash
# backend/.env
# Replace the placeholders below with your actual database credentials
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crowdguardian
DB_USER=cg_user 
DB_PASSWORD=your_strong_app_password 
PORT=3000
```

### 2\. Database Initialization

You must create the database, user, and load the test data.

**A. Create Database and User:** (Connect to your PostgreSQL console as your administrative user to run these commands):

```sql
CREATE DATABASE crowdguardian;
\c crowdguardian;
CREATE USER cg_user WITH PASSWORD 'your_strong_app_password'; 
GRANT ALL PRIVILEGES ON DATABASE crowdguardian TO cg_user;
```

**B. Load Schema and Test Data:**

Use the SQL commands you finalized (e.g., those from the `db_cleanup_chokepoints.sql` and `db_load_test_data.sql` blocks) to insert the current schema and critical metrics for testing.

### 3\. Install Dependencies

Install packages for both the backend/ML engine and the frontend.

```bash
# --- Backend & Python Setup ---
cd backend/
npm install
pip install scikit-learn numpy pandas osmnx networkx

# --- Frontend Setup ---
cd ../frontend/
npm install
```

### 4\. Run the Application

Run both services simultaneously.

```bash
# Terminal 1: Start Backend (ML, Database access, Socket.IO)
cd CrowdGuardian/backend
npm run dev

# Terminal 2: Start Frontend (React UI)
cd CrowdGuardian/frontend
npm run dev
```

The application will be available at `http://localhost:5173`. The system should begin predicting risk and displaying dynamic evacuation routes immediately after the backend starts.
