# Client routing

- **URL Structure**: Feature/role-based first (`/admin/templates/:id`, `/templates/:id/configure`)
- **State Management**: Use React Router loaders for data fetching, actions for mutations
- **Authentication**: Verify auth in route loaders, redirect unauthorized users
- **Organization**: Feature-based routing in dedicated `*Routes.tsx` files
- **Error Handling**: Nested error boundaries at different route hierarchy levels
