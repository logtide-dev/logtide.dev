# LogTide Website

The official website and documentation for [LogTide](https://logtide.dev).

## Tech Stack

- **Astro** - Static site generator
- **Tailwind CSS** - Styling with CSS variables for theming
- **Shiki** - Code syntax highlighting with dual theme support

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Structure

```
src/
├── pages/
│   ├── index.astro          # Landing page
│   └── docs/                 # Documentation pages
├── layouts/
│   ├── Landing.astro        # Layout for marketing pages
│   └── Docs.astro           # Layout for documentation
├── components/
│   ├── Header.astro
│   ├── Footer.astro
│   ├── ThemeToggle.astro    # Dark/light mode toggle
│   ├── landing/             # Landing page sections
│   └── docs/                # Documentation components
│       ├── DocsSidebar.astro
│       ├── DocsTableOfContents.astro
│       └── CodeBlock.astro
└── styles/
    ├── tailwind.css
    └── custom.css           # CSS variables for theming
```

## Theming

The site supports dark and light mode:
- Theme preference is detected from system settings
- Users can toggle manually via the sun/moon button in the header
- Preference is saved in localStorage
- Code blocks adapt syntax highlighting colors to the current theme

## Docker

```bash
# Build and run on default port 4321
docker compose up -d

# Run on custom port
PORT=9876 docker compose up -d
```

## License

AGPLv3
