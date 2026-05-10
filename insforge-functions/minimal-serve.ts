Deno.serve(async (req) => {
  return new Response(JSON.stringify({ ok: true, message: "Hello from Deno.serve" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
