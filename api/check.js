export default async function handler(req, res) {
  const { id } = req.query;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    const prediction = await response.json();
    return res.status(200).json(prediction);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}