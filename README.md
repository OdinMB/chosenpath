# ToDo

Fill with setup instructions with AI

# Last Cursor message to pick up from laptop

Yes, exactly! WebSocket is a protocol that enables two-way communication between the client and server. Unlike HTTP requests which are one-off request/response cycles, WebSocket maintains an open connection that allows:
Client to server messages (like regular requests)
Server to client messages (push notifications) without the client having to ask for them
Here's a typical flow:
So your flow could be:
Client makes HTTP request (choice or next beat) 2. Server sends immediate HTTP response (success/error)
Server processes request asynchronously
When ready, server pushes new state via WebSocket
Client receives push notification and updates its state
Would you like to see how to implement this pattern in your codebase?

# Feature backlog

- Move to websocket only, with full states being pushed to the client
- Select language (different ones for different players)