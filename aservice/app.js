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
      {
        url: url,
        method: method,
        headers: headers
      },
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
  serviceName: "a-service",
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
router.all("/ago", async (ctx, next) => {
  const res = await request("http://localhost:8081/h", {
    method: "POST",
    tracer: ctx.tracer,
    rootSpan: ctx.tracerRootSpan
  });
  console.log(typeof res);
  ctx.body = {
    aValue: "get :7071/a , hello a",
    goValue: JSON.parse(res)
  };
});

router.get("/ab", async (ctx, next) => {
  const result = await request("http://localhost:7072/b", {
    tracer: ctx.tracer,
    rootSpan: ctx.tracerRootSpan
  });
  ctx.body = "get :7071/a , hello a" + "\n" + result;
});

router.get("/abc", async (ctx, next) => {
  const result = await request("http://localhost:7072/bc", {
    tracer: ctx.tracer,
    rootSpan: ctx.tracerRootSpan
  });
  ctx.body = "get :7071/a , hello a" + "\n" + result;
});

app.use(router.routes());

app.listen(7071, () => {
  console.log("\x1B[32m port : 7071 \x1B[39m");
});
