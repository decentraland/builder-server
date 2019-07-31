# Builder Server

Exposes endpoints for the Builder.

## RUN

Check `.env.example` and create your own `.env` file. Some properties have defaults.

```bash
# Setup
createdb builder
cp .env.example .env
vim .env # fill variables, for example CONNECTION_STRING='postgres://localhost:5432/builder'
npm i
npm run migrate up

# Run
npm start
```
