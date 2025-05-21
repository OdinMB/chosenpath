export function Credits() {
  return (
    <div className="max-w-md mx-auto p-4 font-lora">
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        Credits
      </h1>

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
      </div>
    </div>
  );
}
