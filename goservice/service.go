package main

import (
	"log"
	"net"
	"context"
	"strings"
	"google.golang.org/grpc"
	"google.golang.org/grpc/grpclog"
	"google.golang.org/grpc/metadata"
	pb "goservice/helloService"
	opentracing "github.com/opentracing/opentracing-go"
	"github.com/opentracing/opentracing-go/ext"
	"github.com/uber/jaeger-client-go"
	jaegerCfg "github.com/uber/jaeger-client-go/config"
)

// metadata 读写
type MDReaderWriter struct {
	metadata.MD
}

// 为了 opentracing.TextMapReader ，参考 opentracing 代码
func (c MDReaderWriter) ForeachKey(handler func(key, val string) error) error {
	for k, vs := range c.MD {
		for _, v := range vs {
			if err := handler(k, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// 为了 opentracing.TextMapWriter，参考 opentracing 代码
func (c MDReaderWriter) Set(key, val string) {
	key = strings.ToLower(key)
	c.MD[key] = append(c.MD[key], val)
}

func NewJaegerTracer(serviceName string) (opentracing.Tracer, error) {
	cfg := jaegerCfg.Configuration{
		Sampler: &jaegerCfg.SamplerConfig{
			Type: "const",
			Param: 1,
		},
		Reporter: &jaegerCfg.ReporterConfig{
			LogSpans: true,
			CollectorEndpoint: "http://localhost:14268/api/traces",
		},
	}

	cfg.ServiceName = serviceName

	tracer, _, err := cfg.NewTracer(
		jaegerCfg.Logger(jaeger.StdLogger),
	)

	if err != nil {
		log.Println("tracer error ", err)
	}

	return tracer, err
}

// 此处参考 grpc文档 https://godoc.org/google.golang.org/grpc#WithUnaryInterceptor
func interceptor(tracer opentracing.Tracer) grpc.UnaryServerInterceptor{
	return func (ctx context.Context, 
		req interface{}, 
		info *grpc.UnaryServerInfo, 
		handler grpc.UnaryHandler) (res interface{}, err error) {
			md, succ := metadata.FromIncomingContext(ctx)
			if !succ {
				md  = metadata.New(nil)
			}

			// 提取 spanContext
			spanContext, err := tracer.Extract(opentracing.TextMap, MDReaderWriter{md})
			if err != nil && err != opentracing.ErrSpanContextNotFound {
				grpclog.Errorf("extract from metadata err: %v", err)
			} else{
				span := tracer.StartSpan(
					info.FullMethod,
					ext.RPCServerOption(spanContext),
					opentracing.Tag{Key: string(ext.Component), Value: "grpc"},
					ext.SpanKindRPCServer,
				)
				defer span.Finish()
				ctx = opentracing.ContextWithSpan(ctx, span)
			}
			return handler(ctx, req)
	}
}

type server struct{}

func (s *server) SayHello(ctx context.Context, in *pb.HelloReq) (*pb.HelloRes, error) {
	return &pb.HelloRes{Result: "Hello " + in.Name}, nil
}

func main() {

	var svOpts []grpc.ServerOption
	tracer, err := NewJaegerTracer("serviceService")
	if err != nil {
		log.Fatal("new tracer err ", err)
	}

	if tracer != nil {
		svOpts = append(svOpts, grpc.UnaryInterceptor(interceptor(tracer)))
	}

	sv := grpc.NewServer(svOpts...)

	lis, err := net.Listen("tcp", ":8082")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	pb.RegisterHelloServiceServer(sv, &server{})
	if err := sv.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
