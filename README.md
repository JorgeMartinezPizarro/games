## TODO

- Adapt paths to docker volumes. Build last working version.
- Use docker network to connect to the dockerized services for security.

## ABOUT

A private extension for Nextcloud.

It provides:

- 4 web games in nextjs using the user system of nextcloud.

This is a [next.js](https://nextjs.org/) project.

Created and tested using `node@22.12`, `npm@11.2.0` and `docker@26.0.1`.

## SETUP

Copy `.env.sample` to `.env` and write your actual values.

## RUN

Select your preferred method:

#### NPM

Run the UI using node:

```bash
git clone git@github.com:JorgeMartinezPizarro/bookmarks.git
copy .env bookmarks/.env
cd bookmarks
npm install
npm run start
```

#### DOCKER

Run both the UI and stockfish dockerized:

```bash
git clone git@github.com:JorgeMartinezPizarro/bookmarks.git
copy .env bookmarks/.env
cd bookmarks
docker compose up -d
```

Navigate to [http://localhost:3000](http://localhost:3000) to start using the app.

## BUILD

You can use `make build` to build and push the 3 images.

Change the strings `jorgemartinezpizarro/NAME` to you own hub docker namespace.

## NOTE

It is required to link the app with a nextcloud valid URL, otherwise you can bypass the login with 

```bash
NEXT_PUBLIC_ENABLE_LOGIN=false
```

Otherwise you can link with a nextcloud app, and add the `gaming` app to the `custom_apps` nextcloud folder.
