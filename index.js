require("./server/config/config");

const app = require('./server/server')

// Connecting with the database
app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
