const Replicate = require("replicate");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const predictionId = req.query.id;

    if (!predictionId) {
      return res.status(400).json({ error: "Missing prediction id" });
    }

    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN not configured" });
    }

    const replicate = new Replicate({ auth: apiToken });
    const prediction = await replicate.predictions.get(predictionId);

    let imageUrl = null;
    if (prediction.status === "succeeded" && prediction.output) {
      // Instant-ID output can be a single URL string or an array
      if (Array.isArray(prediction.output)) {
        imageUrl = prediction.output[0];
      } else {
        imageUrl = prediction.output;
      }
    }

    return res.status(200).json({
      status: prediction.status,
      imageUrl: imageUrl,
      error: prediction.error || null
    });

  } catch (err) {
    console.error("Check API Error:", err);
    return res.status(500).json({
      error: err.message || "Internal server error"
    });
  }
};
