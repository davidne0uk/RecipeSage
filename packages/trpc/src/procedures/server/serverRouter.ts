import { router } from "../../trpc";
import { getServerFeatures } from "./getServerFeatures";

export const serverRouter = router({
  getServerFeatures,
});
