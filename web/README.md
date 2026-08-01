# Campus Lost and Found Web Application

The full-stack web application for the 159.333 Campus Lost and Found project.

## Technology stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- MongoDB Atlas and Mongoose
- Zod validation

## Requirements

- Node.js 20.9 or later
- npm
- A MongoDB Atlas connection string

## Local setup

1. Run `npm install` to install dependencies.
2. Run `Copy-Item .env.example .env.local` to create a local environment file.
3. Replace the placeholder in `.env.local` with a real MongoDB connection string.
4. Run `npm run dev` to start the development server.
5. Open `http://localhost:3000` in a browser.

Example environment variable:

`MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER_HOST/campus_lost_found?retryWrites=true&w=majority`

Never commit `.env.local`, passwords, connection strings, or other real credentials.

## Quality and security checks

Run these commands before creating a pull request:

- `npm run lint`
- `npm run build`
- `npm audit`

The project temporarily overrides vulnerable transitive versions of Sharp and PostCSS until patched versions are included in a stable Next.js release.