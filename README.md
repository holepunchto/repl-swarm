# repl-swarm

Attach to a node repl using Hyperswarm

```
npm install repl-swarm
```

## Usage

In the app you want to debug

``` js
const repl = require('repl-swarm')

repl({ data: { i: 'am exposed in the repl' }, foo: 'anything in this map is exposed to the repl' })
```

Running the above will print out a secure key you can use to connect to the repl with.
To do so, install the cli

```
npm install -g repl-swarm
```

Then connect from anywhere in the world

```
repl-swarm <key printed above>
```

Then you'll have a full end-to-end encrypted node repl.

## License

MIT
