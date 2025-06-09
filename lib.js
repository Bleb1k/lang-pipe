export class Tokenizer {
  current_token = null
  tokens = []
  skip = []

  constructor(settings = {}) {
    this.debug = settings.debug ?? false
    if (settings.skip_spaces ?? true)
      this.skip.push(/^\s+/)
    return new Proxy(this, {
      get: (self, name) => {
        if (self[name] !== undefined) return self[name]
        self.current_token = [name]
        return self
      }
    })
  }

  is(pattern) {
    if (this.current_token === null) throw "unreachable"
    this.current_token.push(new RegExp(pattern, 'y'))
    this.tokens.push(this.current_token)
    this.current_token = null
  }

  *tokenize(src) {
    if (this.debug) console.log("Parsing:", src)
    while (src.length > 0) {
      if (this.debug) console.log("skipping")
      for (const pattern of this.skip) {
        if (this.debug) console.log(pattern)
        const res = pattern.exec(src)
        if (!res) continue
        if (this.debug) console.log("found", [res[0]])
        src = src.slice(res[0].length)
        if (this.debug) console.log("cut:", src)
      }
      if (this.debug) console.log("to searching")
      for (const [name, pattern] of this.tokens) {
        if (this.debug) console.log(name, pattern)
        const res = pattern.exec(src)
        if (!res || res.index > 0) continue
        if (this.debug) console.log("found", [name, res[0]])
        src = src.slice(res[0].length)
        yield [name, res[0]]
        break
      }
    }
  }
}

function autocall(obj) {
  return new Proxy(obj, {
    get: (self, name, receiver) => {
      let result = Reflect.get(self, name, receiver)
      if (typeof result === "function") {
        result = result.bind(self)
        self.prev_command = name
        if (result.length === 0) return result()
      }
      if (!result && typeof name === "string") throw new Error(`Can't find '${name}'`)
      return result
    }
  })
}

class AstNodeRule {
  name
  /** @type {Array<Function | AstNodeRule>} */
  rules = []

  prev_command = null

  constructor(name) {
    this.name = name
    return autocall(this)
  }

  from() {
    return new Proxy(this, {
      get: (self, name) => {
        if (Ast.current_ast.debug) console.log("from." + name, self)
        if (name === "rec") return self.rec()
        const rule = new AstNodeRule(name)
        rule.rules.push(([tok_name, _value]) => tok_name === name)
        // rule.rules.push(([tok_name, _value]) => (console.log(tok_name, '==', name), tok_name === name))
        rule.parent_rule = self
        self.rules.push(rule)
        return rule
      }
    })
  }

  then() {
    return new Proxy(this, {
      get: (self, name) => {
        if (Ast.current_ast.debug) console.log("then." + name, self)
        if (!self.parent_rule) throw new Error(`Unreachable`);

        const parent = self.parent_rule
        delete self.parent_rule
        delete self.prev_command

        return parent.from()[name]
      }
    })
  }

  rec() {
    return new Proxy(this, {
      get: (self, name) => {
        if (Ast.current_ast.debug) console.log("rec." + name, self)
        let node = Ast.current_ast.nodes.find((v) => v.name === name)
        if (node === undefined) {
          node = new AstNodeRule(name)
          Ast.current_ast.nodes.push(node)
        }
        node.parent_rule = self
        self.rules.push(node)
        return autocall(node)
      }
    })
  }

  is(regex) {
    if (Ast.current_ast.debug) console.log(this.name + ".is", regex, this)
    if (Ast.current_ast.debug) console.log("is:", this.rules.at(-1)?.toString?.())
    const func = this.rules.pop()
    this.rules.push(([_tok_name, value]) => regex.test(value))
    // this.rules.push(([_tok_name, value]) => (console.log("is", func?.toString?.()), func([_tok_name, value])) && (console.log("is", regex.toString(), value), regex.test(value)))
    return autocall(this)
  }

  or() {
    return new Proxy(this, {
      get: (self, name) => {
        if (Ast.current_ast.debug) console.log("or." + name, self)

        const parent = this.parent_rule
        delete this.parent_rule
        delete this.prev_command
        const node = new AstNodeRule(name)
        node.parent_rule = parent

        node.rules.push(([tok_name, _value]) => tok_name === name)

        const prev_parse = self.parse.bind(self)
        self.parse = (tokens, recurse = false) => prev_parse(tokens, recurse) ?? node.parse(tokens, recurse)
        return autocall(node)
      }
    })
    // console.log(this.parent_rule.from()[name])
  }

  end() {
    if (Ast.current_ast.debug) console.log("end", this)
    const parent = this.parent_rule
    delete this.parent_rule
    delete this.prev_command
    if (parent.parent_rule !== undefined) {
      return parent.end()
    }
    delete parent.parent_rule
    delete parent.prev_command
    return parent
  }

  parse(tokens, recurse = false) {
    if (Ast.current_ast.debug) console.log(this.name)
    let tokens_position = 0
    let rules_position = 0
    let result = {
      name: this.name,
      acc: []
    }
    while (rules_position < this.rules.length) {
      let rule = this.rules[rules_position++]
      // console.log(rule, tokens[tokens_position])
      if (Ast.current_ast.debug) console.log(tokens.slice(tokens_position))
      switch (true) {
        case rule instanceof AstNodeRule:
          const foo = rule.parse(tokens.slice(tokens_position), true)
          if (Ast.current_ast.debug) console.log(rule)
          if (foo === null) return null
          tokens_position += foo.tokens_consumed
          result.acc.push(foo.result)
          break
        default:
          const ok = rule(tokens[tokens_position] || [null, null])
          if (Ast.current_ast.debug) console.log(rule.toString())
          if (ok) {
            result.acc.push(...tokens[tokens_position].slice(1))
            tokens_position += 1
          } else return null
          break
      }
    }
    return (recurse ? {
      result, tokens_consumed: tokens_position
    } : result)
  }
}

export class Ast {
  /** @type {Array<AstNode>} */
  nodes = []
  /** @type {Tokenizer} */
  tokenizer

  /** @type {Ast} */
  static current_ast = null

  constructor(tokenizer, settings = {}) {
    this.debug = settings.debug ?? false
    this.tokenizer = tokenizer
    return new Proxy(this, {
      get: (self, name, receiver) => {
        Ast.current_ast = self
        let result = Reflect.get(self, name, receiver)
        result ??= self.nodes.find((v) => v.name === name)
        if (result === undefined && typeof name === "string") {
          result = new AstNodeRule(name)
          self.nodes.push(result)
        }
        return result
      }
    })
  }
}
