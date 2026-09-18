# Pulse Social

Pulse Social is a full-stack social networking demo with real-time updates, profile management, posts, comments, likes, friend requests, privacy controls, and multimedia sharing.

## Features

- User profiles and friend lists
- Feed with posts, comments, and likes
- Friend request workflow
- Real-time Socket.IO updates
- Notifications center
- Privacy controls for profiles and posts
- Multimedia uploads for posts

## Tech Stack

- Backend: Node.js + Express + Socket.IO + Multer
- Frontend: React + Vite

## Run locally

1. Start the server
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. Start the client
   ```bash
   cd client
   npm install
   npm run dev -- --host 0.0.0.0
   ```

3. Open the client in the browser and use the demo switching control to explore profiles.

## API

The backend exposes REST endpoints under /api and uses Socket.IO for live event broadcasts.
