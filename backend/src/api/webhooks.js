const express = require("express");

const router = express.Router();

router.post("/github", (req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Webhook handling will be implemented in a later phase.",
  });
});

module.exports = router;
