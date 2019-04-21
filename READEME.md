## Nodeje-demo

默认已经按照了 jaeger 并在本机启动。(具体下载和使用看[jaeger 官网](https://www.jaegertracing.io)，貌似需要梯子)

jaeger 启动后默认的 UI 项目地址是 http://localhost:16686

```bash
cd aservice / cd bservice / cd cservice
npm start
```

然后打开 http://localhost:7071/abc

## Golang-demo

```bash
cd goservice

go run main.go

go run service.go
```

然后打开 http://localhost:8081/get_h

首次写 go，如有不正之处欢迎指出。
