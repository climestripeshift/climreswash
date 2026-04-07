# Rajasthan Climate Vulnerability Map

## Overview

This is an interactive climate vulnerability and adaptation assessment dashboard for India (735 districts). The application visualizes district-level climate risks, adaptation strategies, health indicators, and air quality data through an interactive map interface. It provides early warning systems for climate hazards, tracks various social and environmental metrics, and displays estimated mitigation and adaptation funding requirements at district and national levels to support climate action planning.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool and development server.

**UI Framework**: The application uses shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling. The design system follows the "new-york" variant with a neutral color scheme and supports both light and dark themes.

**State Management**: React Query (@tanstack/react-query) handles server state management with intelligent caching and background refetching. Local UI state is managed through React hooks.

**Routing**: Wouter provides lightweight client-side routing with two main routes:
- `/` - Main dashboard with interactive map
- `/admin` - Administrative interface for managing districts and integrations

**Map Visualization**: Leaflet powers the interactive geographic visualization, displaying Rajasthan districts with color-coded overlays based on vulnerability or adaptation scores. GeoJSON data defines district boundaries.

**Charts and Analytics**: Recharts library renders various data visualizations including bar charts, line charts, and area charts for seasonal data, health indicators, and air quality trends.

**Theme System**: Custom theme provider enables dark/light mode switching with persistent user preferences stored in localStorage.

### Backend Architecture

**Server Framework**: Express.js handles HTTP requests with a REST API architecture.

**Database Layer**: Drizzle ORM provides type-safe database operations with a PostgreSQL database hosted on Neon (serverless PostgreSQL). The schema includes:
- `districts` - Core climate and demographic data
- `alerts` - Early warning system alerts
- `aqiObservations` - Air quality index measurements
- `apiIntegrations` - External service configurations
- `users` - Authentication data

**Storage Pattern**: A storage abstraction layer (`IStorage` interface) separates business logic from database implementation, making the system flexible and testable.

**Early Warning System**: Server-side logic (`earlyWarning.ts`) computes risk scores based on multiple factors:
- Hazard intensity from seasonal data
- District vulnerability scores
- Health risk multipliers (infant mortality, malnutrition, WASH indicators)
- Seasonal factors
- Alert severity thresholds (advisory, watch, warning, emergency)

**Build Process**: Custom build script bundles the server with esbuild and client with Vite, optimizing for production deployment. Server dependencies are selectively bundled to reduce cold start times.

### Data Model

**District Schema**: Comprehensive climate and social indicators including:
- `countryId` — links every district to a country (`IND` = India); the `countries` table holds national aggregates
- Vulnerability and adaptation scores
- Population and at-risk demographics (children, elderly)
- Climate risks and adaptation strategies
- WASH indicators — Household (water access, toilet coverage, handwashing)
- WASH indicators — Schools (school_toilet_percent, school_water_percent)
- WASH indicators — Anganwadis/ICDS (anganwadi_toilet_percent, anganwadi_water_percent)
- Health metrics (infant/maternal mortality, malnutrition)
- Infrastructure data (soil type, water supply, toilet technology)
- Seasonal hazard data (monthly climate impacts)

**Alert System**: Structured alerts with severity levels, types (heatwave, flood, drought, air quality, health, dust storm), and time-based activation/deactivation.

**AQI Observations**: Time-series air quality data with pollutant breakdowns (PM2.5, PM10, NO2, SO2, CO, O3) and categorization (Good to Severe).

### API Design

**RESTful Endpoints**:
- `GET /api/districts` - List all districts
- `GET /api/districts/:id` - Get district details
- `POST /api/districts` - Create district
- `PATCH /api/districts/:id` - Update district
- `DELETE /api/districts/:id` - Remove district
- `GET /api/alerts` - List alerts
- `GET /api/districts/:id/aqi` - Get AQI data with history
- `POST /api/alerts/recompute` - Trigger alert recalculation
- `GET /api/integrations` - Manage external integrations

**Validation**: Zod schemas ensure type-safe data validation for all API inputs, with integration to Drizzle ORM through drizzle-zod.

## External Dependencies

**Database**: Neon serverless PostgreSQL (@neondatabase/serverless) provides scalable, serverless database hosting with WebSocket support for efficient connections.

**Maps and Geospatial**:
- Leaflet for interactive map rendering
- React-Leaflet for React integration
- GeoJSON data for Rajasthan district boundaries

**UI Components**: Radix UI primitives provide accessible, unstyled components extended with Tailwind CSS through shadcn/ui.

**Styling**: 
- Tailwind CSS with custom theme configuration
- CSS variables for dynamic theming
- Inter and Space Mono fonts from Google Fonts

**Development Tools**:
- Replit-specific plugins for error handling, cartographer, and dev banner
- TypeScript for type safety
- ESBuild for fast server bundling
- Vite for fast frontend builds and HMR

**State and Forms**:
- React Query for server state
- React Hook Form with Zod resolvers for form validation
- Framer Motion for animations

The application does not currently use authentication middleware or session management, though the schema includes a users table for future implementation.