// ./edge-functions/api/hello.js
export default function onRequest(context) {
  return new Response('Hello from Edge Functions!');
}
