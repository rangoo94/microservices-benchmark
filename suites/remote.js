"use strict";

let Promise = require("bluebird");
let Benchmarkify = require("benchmarkify");

let benchmark = new Benchmarkify("Microservices benchmark").printHeader();

const bench = benchmark.createSuite("Call remote actions");

// Moleculer
let broker1;
let broker2;
(function () {

	const { ServiceBroker } = require("moleculer");
	broker1 = new ServiceBroker({ nodeID: "node-1", transporter: "TCP" });
	broker2 = new ServiceBroker({ nodeID: "node-2", transporter: "TCP" });

	broker2.createService({
		name: "math",
		actions: {
			add(ctx) {
				return ctx.params.a + ctx.params.b;
			}
		}
	});
	broker1.start();
	broker2.start();

	bench.add("Moleculer", done => {
		broker1.call("math.add", { a: 5, b: 3 }).then(done);
	});

})();

// Hemera
let hemera1;
let hemera2;
(function () {

	const Hemera = require('nats-hemera');
	const nats = require('nats').connect("nats://localhost:4222");

	hemera1 = new Hemera(nats, { logLevel: 'error' });
	hemera2 = new Hemera(nats, { logLevel: 'error' });

	hemera2.ready(() => {
		hemera2.add({ topic: 'math', cmd: 'add' }, (resp, cb) => {
			//console.log("Call", resp);
			cb(null, resp.a + resp.b);
		});
	});

	bench.add("Hemera", done => {
		hemera1.act({ topic: 'math', cmd: 'add', a: 5, b: 3 }, (err, res) => done());
	});

})();

// Cote
let cote_resp;
let cote_req;
(function () {
	const cote = require('cote');

	cote_resp = new cote.Responder({ name: 'bench-remote' });
	cote_req = new cote.Requester({ name: 'bench-remote' });
	
	cote_resp.on('add', (req, cb) => {
		cb(req.a + req.b);
	});	

	bench.add("Cote", done => {
		cote_req.send({ type: 'add', a: 5, b: 3 }, res => done());
	});

})();

// Seneca
let seneca1;
let seneca2;
(function () {
	seneca1 = require("seneca")()
		.use('nats-transport')
		.client({ type: 'nats' });
	
	seneca2 = require("seneca")()
		.use('nats-transport')
		.add({ cmd: 'add' }, (msg, done) => {
			// console.log("Call", msg);
			done(null, { res: msg.a + msg.b });
		})
		.listen({ type: 'nats' })

	bench.add("Seneca", done => {
		seneca1.act({ cmd: 'add', a: 5, b: 3 }, (err, res) => done());
	});

})();

Promise.delay(3000).then(() => {

	return benchmark.run([bench]).then(() => {
		hemera1.close();
		hemera2.close();

		broker1.stop();
		broker2.stop();

		seneca2.close();
		seneca1.close();

		cote_req.close();
		cote_resp.close();
	});

});
