<p align="center">
  <img src="client/public/ChosenPath-Horizontal-1024x536.png" alt="Chosen Path — Any Story, Any Time" width="600">
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
</p>

An AI-powered multiplayer interactive fiction platform. Create any world you want — the AI generates prose, images, and game mechanics. Play alone or with friends.

<p align="center">
  <img src="client/public/category-fiction.jpeg" alt="Interactive fiction" width="32%">
  <img src="client/public/landing/multiplayer2.jpeg" alt="Multiplayer storytelling" width="32%">
  <img src="client/public/category-futureself.jpeg" alt="Future-self exploration" width="32%">
</p>

## Running Locally

### Prerequisites

- Node.js (v18 or higher)
- npm (v8 or higher)
- OpenAI API key

### Local Setup

1. Clone the repository and install dependencies

```bash
git clone https://github.com/OdinMB/chosenpath.git
npm run install:all
```

2. Create environment files

Create `.env` based on `.env.sample` in the server directory.

Create `.env` based on `.env.sample` in the client directory.

3. Start the development servers

```bash
npm run dev
```

This will start:

- Client at http://localhost:5173
- Server at http://localhost:3000

## Story Engine

Chosen Path is built on a narrative simulation engine that handles AI-powered story generation, branching mechanics, stat systems, outcome resolution, and multiplayer coordination.

<p align="center">
  <img src="client/public/landing/stories-out-of-open-book.jpeg" alt="Stories emerging from an open book" width="500">
</p>

We plan to extract this engine into a standalone package (`chosenpath-engine`) so that other projects — education platforms, coaching tools, training simulations, research applications — can integrate interactive narrative capabilities without forking the full application.

If you're interested in using the engine in your own project, open an issue or get in touch. Your use case will help shape the extraction priorities.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## License

Chosen Path is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-or-later).

If you deploy a modified version of this software as a network service, you must make your modified source code available under the same license. See the [LICENSE](LICENSE) file for full terms.

For alternative licensing arrangements (e.g., commercial use under different terms), see the [Stewardship](https://chosenpath.ai/stewardship) page.
