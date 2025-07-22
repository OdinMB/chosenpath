import { Footer } from "../components/Footer";

export function Credits() {
  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      <div className="mb-6">
        <img
          src="/thank-you.jpeg"
          alt="Thank you"
          className="w-full rounded-lg object-cover"
        />
      </div>

      {/* <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        Credits
      </h1> */}

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            Fonts
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-xl font-montserrat font-bold mb-1">
                Montserrat
              </h3>
              <p className="text-sm text-primary-600">
                Copyright 2011{" "}
                <a
                  href="https://github.com/JulietaUla/Montserrat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Montserrat Project Authors
                </a>
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              <h3 className="text-xl font-lora font-semibold mb-1">Lora</h3>
              <p className="text-sm text-primary-600">
                Copyright 2011{" "}
                <a
                  href="https://github.com/cyrealtype/Lora-Cyrillic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Lora Project Authors
                </a>
                , with Reserved Font Name "Lora".
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-montserrat font-semibold mb-3 text-primary-700">
            Open Source Software
          </h2>
          <p className="mb-4 text-sm text-primary-600">
            This project would not be possible without the incredible work of
            the open source community. We extend our heartfelt thanks to all the
            maintainers and contributors of these projects:
          </p>

          <div className="space-y-4">
            <div className="p-4 bg-primary-50 rounded-lg">
              {" "}
              <h3 className="text-lg font-semibold mb-1">Frontend</h3>{" "}
              <p className="text-sm text-primary-600">
                {" "}
                <a
                  href="https://github.com/facebook/react"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  React
                </a>
                ,{" "}
                <a
                  href="https://github.com/remix-run/react-router"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  React Router
                </a>
                ,{" "}
                <a
                  href="https://github.com/tailwindlabs/tailwindcss"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Tailwind CSS
                </a>
                ,{" "}
                <a
                  href="https://github.com/clauderic/dnd-kit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  dnd-kit
                </a>{" "}
                ,{" "}
                <a
                  href="https://github.com/remarkjs/react-markdown"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  React Markdown
                </a>
                ,{" "}
                <a
                  href="https://github.com/atomiks/tippyjs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Tippy.js
                </a>
                ,{" "}
                <a
                  href="https://github.com/vitejs/vite"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Vite
                </a>
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              {" "}
              <h3 className="text-lg font-semibold mb-1">Backend</h3>{" "}
              <p className="text-sm text-primary-600">
                <a
                  href="https://github.com/expressjs/express"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Express
                </a>
                ,{" "}
                <a
                  href="https://github.com/socketio/socket.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Socket.io
                </a>
                ,{" "}
                <a
                  href="https://github.com/postgres/postgres"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  PostgreSQL
                </a>
                ,{" "}
                <a
                  href="https://github.com/auth0/node-jsonwebtoken"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  JWT
                </a>
                ,{" "}
                <a
                  href="https://github.com/kelektiv/node.bcrypt.js"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  bcrypt
                </a>
                ,{" "}
                <a
                  href="https://github.com/colinhacks/zod"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  Zod
                </a>
                ,{" "}
                <a
                  href="https://github.com/microsoft/TypeScript"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  TypeScript
                </a>
              </p>
            </div>

            <div className="p-4 bg-primary-50 rounded-lg">
              {" "}
              <h3 className="text-lg font-semibold mb-1">
                {" "}
                AI & Data Processing{" "}
              </h3>{" "}
              <p className="text-sm text-primary-600">
                {" "}
                <a
                  href="https://github.com/langchain-ai/langchainjs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  {" "}
                  LangChain{" "}
                </a>{" "}
                ,{" "}
                <a
                  href="https://github.com/openai/openai-node"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  {" "}
                  OpenAI{" "}
                </a>{" "}
                ,{" "}
                <a
                  href="https://github.com/Stuk/jszip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  {" "}
                  JSZip{" "}
                </a>{" "}
                ,{" "}
                <a
                  href="https://github.com/axios/axios"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800 underline"
                >
                  {" "}
                  Axios{" "}
                </a>{" "}
              </p>{" "}
            </div>
          </div>
        </section>
      </div>
      
      <Footer />
    </div>
  );
}
