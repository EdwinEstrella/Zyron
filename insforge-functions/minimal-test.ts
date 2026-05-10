export default async function(req) {
  return new Response(JSON.stringify({ ok: true, message: "Hello from minimal edge function" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
