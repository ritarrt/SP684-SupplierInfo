import axios from "axios";

const EXTERNAL_API_BASE = "http://192.192.0.37:8000/api";

const axiosInstance = axios.create({
  timeout: 30000
});

export const getProjectPrices = async (req, res) => {
  try {
    const { branch } = req.query;

    if (!branch) {
      return res.status(400).json({ error: "กรุณาระบุ branch code" });
    }

    console.log(`Fetching project prices for branch: ${branch}`);
    
    const response = await axiosInstance.get(
      `${EXTERNAL_API_BASE}/project-prices/branch/${branch}/all`
    );

    console.log(`Project prices response:`, response.data);
    res.json(response.data);
  } catch (err) {
    console.error("getProjectPrices error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    // Return empty array instead of error when external API is unavailable
    res.json([]);
  }
};