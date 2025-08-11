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

## API

#### `const seed = repl(opts)`

`opts` include:
- `seed`: the seed to use (if not set, it checks the `REPL_SWARM` environment variable. If that is not set either then it defaults to a random seed)
- `logSeed`: whether to log the seed (default true).

Any other opts are exposed over the repl (see Usage section).

## License

MIT
