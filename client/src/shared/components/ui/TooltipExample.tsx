import React from "react";
import { Tooltip, InfoIcon } from "./";

export const TooltipExample: React.FC = () => {
  return (
    <div className="p-6 space-y-8 max-w-xl mx-auto font-lora">
      <h1 className="text-2xl font-bold mb-4 text-primary">
        Tooltip Component Examples
      </h1>

      <div className="flex flex-wrap justify-center gap-6">
        <div className="text-center">
          <h2 className="mb-2 font-semibold text-primary">Basic Positions</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div></div>
            <Tooltip content="Top tooltip" position="top">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border border-primary-100 shadow-sm hover:shadow-md transition-all">
                Top
              </button>
            </Tooltip>
            <div></div>

            <Tooltip content="Left tooltip" position="left">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border border-primary-100 shadow-sm hover:shadow-md transition-all">
                Left
              </button>
            </Tooltip>
            <div className="flex items-center justify-center">
              <span className="text-primary-500">Hover me</span>
            </div>
            <Tooltip content="Right tooltip" position="right">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border border-primary-100 shadow-sm hover:shadow-md transition-all">
                Right
              </button>
            </Tooltip>

            <div></div>
            <Tooltip content="Bottom tooltip" position="bottom">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border border-primary-100 shadow-sm hover:shadow-md transition-all">
                Bottom
              </button>
            </Tooltip>
            <div></div>
          </div>
        </div>

        <div className="text-center">
          <h2 className="mb-2 font-semibold text-primary">
            Start/End Variants
          </h2>
          <div className="grid grid-cols-1 gap-2">
            <Tooltip content="Top Start tooltip" position="top-start">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-accent shadow-sm hover:shadow-md transition-all">
                Top Start
              </button>
            </Tooltip>
            <Tooltip content="Top End tooltip" position="top-end">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-accent shadow-sm hover:shadow-md transition-all">
                Top End
              </button>
            </Tooltip>
            <Tooltip content="Bottom Start tooltip" position="bottom-start">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-accent shadow-sm hover:shadow-md transition-all">
                Bottom Start
              </button>
            </Tooltip>
            <Tooltip content="Bottom End tooltip" position="bottom-end">
              <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-accent shadow-sm hover:shadow-md transition-all">
                Bottom End
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="border-t pt-4 border-primary-100">
        <h2 className="mb-2 font-semibold text-primary">Custom Styling</h2>
        <div className="flex flex-wrap gap-4">
          <Tooltip
            content="Accent tooltip with custom styling"
            position="top"
            delay={1000}
            contentClassName="bg-accent text-white border-accent"
          >
            <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-accent shadow-sm hover:shadow-md transition-all">
              Accent Style (1s delay)
            </button>
          </Tooltip>

          <Tooltip
            content="Secondary tooltip"
            position="top"
            contentClassName="bg-secondary text-white border-secondary"
          >
            <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-secondary shadow-sm hover:shadow-md transition-all">
              Secondary Style
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="p-1">
                <h3 className="font-bold">Rich Content</h3>
                <p>Tooltips can contain complex content</p>
                <ul className="list-disc pl-4 mt-1">
                  <li>Including lists</li>
                  <li>And other elements</li>
                </ul>
              </div>
            }
            position="right"
            contentClassName="w-64"
          >
            <button className="px-3 py-2 bg-white text-primary rounded-lg border-l-4 border border-primary-100 shadow-sm hover:shadow-md transition-all">
              Rich Content
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="border-t pt-4 border-primary-100">
        <h2 className="text-lg font-semibold mb-2 text-primary">
          Real-World Examples
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-2 text-primary">Form Fields</h3>
            <div className="flex items-center bg-white p-3 rounded-lg border border-primary-100 shadow-sm">
              <label htmlFor="username" className="mr-2 text-primary">
                Username:
              </label>
              <input
                id="username"
                type="text"
                className="px-2 py-1 border rounded flex-grow"
                placeholder="Enter username"
              />
              <InfoIcon tooltipText="Username must be at least 3 characters" />
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2 text-primary">Stats Display</h3>
            <div className="bg-white p-3 rounded-lg border border-primary-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-primary flex items-center">
                  Risk Level
                  <InfoIcon tooltipText="How dangerous your current choices are" />
                </span>
                <span className="text-accent font-bold">Medium</span>
              </div>

              <div className="h-6 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden flex">
                <Tooltip
                  content="Low Risk: 30%"
                  position="top"
                  contentClassName="bg-accent text-white border-accent"
                >
                  <div
                    className="h-full bg-accent bg-opacity-30 cursor-pointer"
                    style={{ width: "30%" }}
                  ></div>
                </Tooltip>
                <Tooltip
                  content="Medium Risk: 40%"
                  position="top"
                  contentClassName="bg-accent text-white border-accent"
                >
                  <div
                    className="h-full bg-accent bg-opacity-60 cursor-pointer"
                    style={{ width: "40%" }}
                  ></div>
                </Tooltip>
                <Tooltip
                  content="High Risk: 30%"
                  position="top"
                  contentClassName="bg-accent text-white border-accent"
                >
                  <div
                    className="h-full bg-accent cursor-pointer"
                    style={{ width: "30%" }}
                  ></div>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
