import { Tokenizer } from "./lib.js"
import App, { Type, import_kind } from "../wasm-backend-thing/lib.js"
import W from "../wasm-backend-thing/instructions.js"
import { I32 } from "../wasm-backend-thing/expand_instr.js"
// what I want to create for now is something like
// porth/forth: stack based concatenative lang
//
// let's parse this first:
const src = `
72 .
101 .
108 .
108 .
111 .
44 .
32 . 
119 .
111 .
114 .
108 .
100 .
33 .
10 .
`

const t = new Tokenizer({
  skip_spaces: true,
  debug: false,
})
t.NUMBER.is(/\d+(?:\.\d*)?(_[ui]\d{1,3})?/)
t.NAME.is(/([^\d\s][^\s]*)/)

const tt = t.tokenize(src)

const app = new App()
const w_std = app.newImport("std", [
  ["putchar", import_kind.Func([Type.i32])]
])
const intrinsic = {
  '.': W.call(w_std.putchar),
  '+': I32.add(),
}

const stack = []
const program = []
for (const [type, val] of tt) {
  switch (type) {
    case "NUMBER":
      program.push(I32.const(Number(val)))
      break
    case "NAME": {
      if (intrinsic[val] === undefined)
        throw new Error(`Undefined identifier ${val}`)
      program.push(intrinsic[val])
      break;
    }
  }
}

app.newFunction([], [], program, { export: "main" })

const { instance, module } = await app.compile({std: {
  putchar: (num) => void process.stdout.write(String.fromCharCode(num)),
}}, {
  debug: false
})

instance.exports.main()
