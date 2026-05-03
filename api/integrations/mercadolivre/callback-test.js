export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    ok: true,
    message: "Callback route is working"
  });
}
