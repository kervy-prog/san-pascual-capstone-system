import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, () => {
  console.log(`San Pascual API listening on port ${env.PORT}`);
});
