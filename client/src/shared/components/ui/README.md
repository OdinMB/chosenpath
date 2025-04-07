# UI Components

This directory contains reusable UI components for the application.

## Tooltip

A customizable tooltip component that can be positioned around its target element and stays within the viewport.

### Usage

```tsx
import { Tooltip } from './ui/Tooltip';

// Basic usage
<Tooltip content="This is a tooltip">
  <button>Hover me</button>
</Tooltip>

// With custom positioning
<Tooltip content="Right tooltip" position="right">
  <button>Hover from right</button>
</Tooltip>

// With styled content
<Tooltip
  content="Accent color tooltip"
  position="top"
  contentClassName="bg-accent text-white border-accent"
>
  <button>Accent tooltip</button>
</Tooltip>

// With secondary color
<Tooltip
  content="Secondary color tooltip"
  position="bottom"
  contentClassName="bg-secondary text-white border-secondary"
>
  <button>Secondary tooltip</button>
</Tooltip>
```

### Props

| Prop               | Type      | Default    | Description                                            |
| ------------------ | --------- | ---------- | ------------------------------------------------------ |
| `children`         | ReactNode | (required) | The element that triggers the tooltip on hover         |
| `content`          | ReactNode | (required) | Content to display in the tooltip                      |
| `position`         | Position  | 'top'      | Where to position the tooltip relative to the children |
| `delay`            | number    | 200        | Delay in ms before showing the tooltip                 |
| `className`        | string    | ''         | Additional classes for the wrapper element             |
| `contentClassName` | string    | ''         | Additional classes for the tooltip content             |
| `disabled`         | boolean   | false      | Whether the tooltip is disabled                        |

### Position Options

- `top` (default) - Above the element, centered
- `right` - To the right of the element, centered vertically
- `bottom` - Below the element, centered
- `left` - To the left of the element, centered vertically
- `top-start` - Above the element, aligned with left edge
- `top-end` - Above the element, aligned with right edge
- `right-start` - To the right, aligned with top edge
- `right-end` - To the right, aligned with bottom edge
- `bottom-start` - Below the element, aligned with left edge
- `bottom-end` - Below the element, aligned with right edge
- `left-start` - To the left, aligned with top edge
- `left-end` - To the left, aligned with bottom edge

### Features

- Automatically repositions if the tooltip would go outside the viewport
- Supports custom styling through className and contentClassName props
- Smooth fade-in animation
- Automatically positions tooltip arrow based on position
- Supports custom delays for showing the tooltip
