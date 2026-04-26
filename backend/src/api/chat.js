const express = require("express");

const router = express.Router();

router.post("/", (req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Chat API will be implemented in a later phase.",
  });
});

module.exports = router;
