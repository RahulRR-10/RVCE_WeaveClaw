const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Suggestions API will be implemented in a later phase.",
  });
});

module.exports = router;
