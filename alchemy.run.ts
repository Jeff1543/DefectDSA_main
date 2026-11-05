import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export const Web = Cloudflare.Worker("Web", {
  main: "./cloudflare/worker.ts",
  assets: {
    directory: "./app/static",
    runWorkerFirst: ["/api", "/api/*"],
  },
  env: {
    API_ORIGIN: Config.String("API_ORIGIN"),
  },
});

export type WorkerEnv = Cloudflare.InferEnv<typeof Web>;

export default Alchemy.Stack(
  "DefectDSA",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const web = yield* Web;
    return { url: web.url };
  }),
);
