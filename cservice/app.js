const Koa = require("koa");
const Router = require("koa-router");
const { initTracer, ZipkinB3TextMapCodec } = require("jaeger-client");
const { FORMAT_HTTP_HEADERS } = require("opentracing");

// app
const app = new Koa();
const router = new Router();

// app use trace
const jaegerConfig = {
  serviceName: "c-service",
  sampler: { type: "const", param: 1 },
  reporter: {
    logSpans: true,
    collectorEndpoint: "http://localhost:14268/api/traces"
  }
};

const jaegerOptions = { baggagePrefix: "x-b3-" };

const tracer = initTracer(jaegerConfig, jaegerOptions);

app.use(async (ctx, next) => {
  const parent = tracer.extract(FORMAT_HTTP_HEADERS, ctx.headers);
  const _config = parent ? { childOf: parent } : {};
  const span = tracer.startSpan(`${ctx.host}`, _config);
  span.setTag("route", ctx.path);
  ctx.tracerRootSpan = span;
  ctx.tracer = tracer;
  span.log({ event: "test-log_1", kk: "kk_1", vv: "vv_1" });
  span.log({ event: "test-log_2", kk: "kk_2", vv: "vv_2" });
  span.log({ event: "test-log_3", kk: "kk_3", vv: "vv_3" });
  span.logEvent("log-event_1", { a: 1, b: 1 });
  span.logEvent("log-event_2", { a: 2, b: 2 });
  await next();
  span.finish();
});

// app router
router.get("/c", async (ctx, next) => {
  ctx.body = "get :7073/c , hello c";
});

app.use(router.routes());

app.listen(7073, () => {
  console.log("\x1B[32m port : 7073 \x1B[39m");
});
