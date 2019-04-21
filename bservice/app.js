const Koa = require("koa");
const Router = require("koa-router");
const Request = require("request");
const { initTracer, ZipkinB3TextMapCodec } = require("jaeger-client");
const { FORMAT_HTTP_HEADERS, Tags } = require("opentracing");
const noop = () => {};

// request
const request = (url, options) => {
  const method = (options && options.method) || "GET";
  const headers = (options && options.headers) || {};
  const tracer = (options && options.tracer) || { inject: noop, setTag: noop };
  const rootSpan = (options && options.rootSpan) || {};
  const _config = rootSpan ? { childOf: rootSpan } : {};
  const span = tracer.startSpan(`${url}`, _config);
  span.setTag(Tags.HTTP_URL, url);
  span.setTag(Tags.HTTP_METHOD, method);
  tracer.inject(span, FORMAT_HTTP_HEADERS, headers);
  const promise = new Promise((resolve, reject) => {
    Request(
      { url: url, method: method, headers: headers },
      (err, res, body) => {
        span.finish();
        if (err) {
          console.log("request error : ", err);
          reject(err);
        } else {
          resolve(body);
        }
      }
    );
  });
  return promise;
};

// app
const app = new Koa();
const router = new Router();

// app use trace
const jaegerConfig = {
  serviceName: "b-service",
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
  await next();
  span.finish();
});

// app router
router.get("/b", async (ctx, next) => {
  ctx.body = "get :7072/b , hello b";
});

router.get("/bc", async (ctx, next) => {
  const span = ctx.tracer.startSpan(`api:bc`, { childOf: ctx.tracerRootSpan });
  span.setTag("request:c", ":7073/c");
  try {
    throw Error("err");
  } catch (err) {
    span.setTag("error", true);
    span.log({
      level: "error",
      message: err.message
    });
  }
  const result = await request("http://localhost:7073/c", {
    tracer: ctx.tracer,
    rootSpan: ctx.tracerRootSpan
  });
  span.finish();
  ctx.body = "get :7072/b , hello b" + "\n" + result;
});

app.use(router.routes());

app.listen(7072, () => {
  console.log("\x1B[32m port : 7072 \x1B[39m");
});
