export class Tokenizer {
  current_token = null
  tokens = []
  skip = []

  constructor(settings = {}) {
    this.debug = settings.debug ?? false
    if (settings.skip_spaces ?? true)
      this.skip.push(/\s+/y)
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
    this.current_token.push(new RegExp(pattern, "y"))
    this.tokens.push(this.current_token)
    this.current_token = null
  }

  *tokenize(src) {
  if (src instanceof Array) src = String.raw(src)
  let pos = 0;
  const len = src.length;

  if (this.debug) {
    console.log(`Parsing input →`, src);
    console.log("\n--- Tokenizer Debug ---");
    console.log("Skip patterns:");
    this.skip.forEach((p, i) => console.log(`  [${i}]`, p));
    console.log("Token patterns:");
    this.tokens.forEach(([name, pattern], i) => console.log(`  [${i}]`, name, pattern));
    console.log("------------------------\n");
  }

  while (pos < len) {
    let matched = false;

    // --- Step 1: Skip patterns ---
    if (this.debug) console.log("\n[SKIPPING]");
    for (const pattern of this.skip) {
      pattern.lastIndex = pos;
      const match = pattern.exec(src);
      if (match && match.index === pos) {
        const value = match[0];
        pos += value.length;
        matched = true;
        if (this.debug) {
          console.log("  ✅ Skipped:", JSON.stringify(value));
        }
        break;
      }
    }
    if (matched) continue;

    // --- Step 2: Token patterns ---
    if (this.debug) console.log("\n[TRYING TOKENS]");
    for (const [name, pattern] of this.tokens) {
      pattern.lastIndex = pos;
      const match = pattern.exec(src);
      if (match && match.index === pos) {
        const value = match[0];
        pos += value.length;
        if (this.debug) {
          console.log(`  ✅ Matched ${name}:`, JSON.stringify(value));
        }
        yield [name, value];
        matched = true;
        break;
      }
    }

    if (!matched) {
      const context = src.slice(pos, pos + 50).replace(/\n/g, "\\n");
      console.error(`❌ Stuck on tokenizing '${context}...'`);
      console.log("Current position:", pos);
      console.log("Tokens so far:", [...this.tokens]);
      throw new Error(`Tokenizer stuck at position ${pos}`);
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

const ast_bnf_tok = new Tokenizer()
ast_bnf_tok.EQUALS.is(/<[a-zA-Z_][a-zA-Z0-9_-]*>\s*::=/)
ast_bnf_tok.IDENTIFIER.is(/<[a-zA-Z_][a-zA-Z0-9_-]*>/)
ast_bnf_tok.LABEL.is(/d+/)
ast_bnf_tok.LITERAL.is(/"(?:\\[^]|[^\"\\])+"/)
ast_bnf_tok.BRACKET_LITERAL.is(/\[(?:\\[^]|[^\]\\])*\]/)
ast_bnf_tok.L_PAREN.is(/\(/)
ast_bnf_tok.R_PAREN.is(/\)/)
// ast_bnf_tok.L_BRACKET.is(/\[/)
// ast_bnf_tok.R_BRACKET.is(/\]/)
ast_bnf_tok.OR.is(/\|/)
// ast_bnf_tok.EQUALS.is(/::=/)
ast_bnf_tok.OPTION.is(/\?/)
ast_bnf_tok.ONE_OR_MORE.is(/\+/)
ast_bnf_tok.ZERO_OR_MORE.is(/\*/)

export class BNFParser {
  constructor(settings = {}) {
    this.tokens = [];
    this.pos = 0;
    this.debug = settings.debug ?? false;
    if (this.debug) console.log("BNFParser initialized", { debug: this.debug });
  }

  *parse(input) {
    if (this.debug) console.log("Starting parse with input:", input);
    this.tokens = [...ast_bnf_tok.tokenize(input)];
    this.pos = 0;
    if (this.debug) console.log("Tokens generated:", this.tokens);

    // Parse the first rule
    if (this.debug) console.log("Parsing first rule at position 0");
    yield this.parseRule();

    // Parse additional rules
    while (this.pos < this.tokens.length) {
      if (this.current() === "EQUALS") {
        if (this.debug) console.log("Found additional rule at pos", this.pos);
        yield this.parseRule();
      } else {
        // Skip invalid tokens
        if (this.debug) console.log("Skipping unexpected token:", this.current(), "at pos", this.pos);
        this.pos++;
      }
    }
    
    if (this.debug) console.log("Parsing completed");
  }

  parseRule() {
    if (this.debug) console.log("Parsing Rule at position", this.pos);
    const name = this.expect("EQUALS")?.replace?.(/\s*::=/, ''); // <identifier>
    if (!name) throw new Error("Expected EQUALS at position " + this.pos);
    if (this.debug) console.log("Rule name parsed:", name);
    
    if (this.debug) console.log("Parsing rule body at position", this.pos);
    
    const expr = this.parseExpression();
    
    if (this.debug) console.log("Rule parsed successfully", { name, expr });
    return { type: "rule", name, body: expr };
  }

  parseExpression() {
    if (this.debug) console.log("Parsing expression at pos", this.pos);
    const branches = [this.parseTerm()];
    
    while (this.expect("OR")) {
      if (this.debug) console.log("Found OR operator at pos", this.pos - 1);
      branches.push(this.parseTerm());
    }
    
    if (this.debug) console.log("Expression parsed with", branches.length, "branches");
    return branches.length === 1 ? branches[0] : { type: "alternation", branches };
  }

  parseTerm() {
    if (this.debug) console.log("Parsing Term at", this.pos);
    const items = [];
    
    while (true) {
      const atom = this.parseAtom();
      if (!atom) break;
      
      const repeated = this.parseRepetition(atom);
      items.push(repeated);
      
      if (this.debug) console.log("Added term item:", {
        item: repeated,
        position: this.pos
      });
    }
    
    if (this.debug) console.log("Term completed with", items.length, "items");
    return items.length === 1 ? items[0] : { type: "sequence", items };
  }

  parseAtom() {
    if (this.debug) console.log("Parsing Atom at", this.pos);
    
    // Labeled groups
    const opener = this.current();
    if (opener && ["L_PAREN", "L_CURLY"].includes(opener)) {
      if (this.debug) console.log("Found opening bracket for labeled group:", opener);
      const labeledGroup = this.parseLabeledGroup();
      if (labeledGroup) {
        const repeated = this.parseRepetition(labeledGroup);
        if (this.debug) console.log("Completed labeled group parsing:", repeated);
        return repeated;
      }
    }

    // Regular groups
    if (this.expect("L_PAREN")) {
      if (this.debug) console.log("Parsing parenthesized group at", this.pos - 1);
      const expr = this.parseExpression();
      this.expect("R_PAREN");
      const repeated = this.parseRepetition({ type: "group", content: expr });
      if (this.debug) console.log("Completed group parsing:", repeated);
      return repeated;
    }

    // Identifiers
    const ident = this.expect("IDENTIFIER");
    if (ident) {
      const node = { type: "identifier", value: ident };
      if (this.debug) console.log("Parsed identifier:", ident);
      return node;
    }

    // String literals
    const literal = this.expect("LITERAL");
    if (literal) {
      const node = { type: "literal", value: literal.slice(1, -1) };
      if (this.debug) console.log("Parsed string literal:", literal);
      return node;
    }

    // Regex bracket literals
    const bracketLiteral = this.expect("BRACKET_LITERAL");
    if (bracketLiteral) {
      const node = { type: "bracket-literal", value: bracketLiteral.slice(1, -1) };
      if (this.debug) console.log("Parsed bracket literal:", bracketLiteral);
      return node;
    }

    if (this.debug) console.log("No atom matched at", this.pos);
    return null;
  }

  parseRepetition(node) {
    if (this.debug) console.log("Checking repetition modifiers at pos", this.pos);
    
    const type = this.current();
    if (type === "ONE_OR_MORE") {
      if (this.debug) console.log("Applying '+' modifier to node");
      this.pos++;
      return { type: "repetition", modifier: "+", content: node };
    } else if (type === "ZERO_OR_MORE") {
      if (this.debug) console.log("Applying '*' modifier to node");
      this.pos++;
      return { type: "repetition", modifier: "*", content: node };
    } else if (type === "OPTION") {
      if (this.debug) console.log("Applying '?' modifier to node");
      this.pos++;
      return { type: "repetition", modifier: "?", content: node };
    }
    
    if (this.debug) console.log("No repetition modifier found");
    return node;
  }

  parseLabeledGroup() {
    const opener = this.current();
    if (!opener || !["L_PAREN", "L_CURLY"].includes(opener)) {
      if (this.debug) console.log("Not a labeled group opener at", this.pos);
      return null;
    }

    if (this.debug) console.log("Parsing labeled group starting with", opener, "at pos", this.pos);
    this.pos++; // consume opener
    
    const label = this.expect("LABEL");
    if (label) {
      if (this.debug) console.log("Found label:", label);
    } else {
      if (this.debug) console.log("No label found for group at pos", this.pos);
    }

    const content = this.parseExpression();
    if (!content) throw new Error("Expected content inside group at pos" + this.pos);

    const closerMap = {
      "L_PAREN": "R_PAREN",
      "L_CURLY": "R_CURLY"
    };
    const expectedCloser = closerMap[opener];
    
    if (!this.expect(expectedCloser)) {
      throw new Error(`Expected closing ${expectedCloser} for ${opener} at pos ${this.pos}`);
    }

    if (label && this.expect("LABEL") !== label) {
      throw new Error(`Label mismatch: expected ${label} at pos ${this.pos}`);
    }

    if (this.debug) console.log("Completed labeled group parsing", {
      label,
    });

    return {
      type: "group",
      label,
      content
    };
  }

  // Utility
  expect(type) {
    if (this.pos >= this.tokens.length) {
      if (this.debug) console.log("End of tokens reached when expecting", type);
      return null;
    }
    
    const token = this.tokens[this.pos];
    
    if (token[0] === type) {
      if (this.debug) console.log("Consuming token:", type, "value:", token[1], "pos:", this.pos);
      this.pos++;
      return token[1];
    } else {
      if (this.debug) console.log(
        "Unexpected token at pos", this.pos,
        "- Expected:", type,
        "Got:", token[0],
        "Value:", token[1]
      );
      return null;
    }
  }

  current() {
    if (this.pos >= this.tokens.length) {
      if (this.debug) console.log("Current position at end of tokens");
      return null;
    }
    return this.tokens[this.pos][0];
  }
}

/*
rule
  | fn([name, val]) -> bool | null
  | {
  name: string
  rules: Array<rule>
} | &rule
*/

/*
I should split it into stages

*/

// const global_rules = {
//   is_name_the_same: (name) => ([tok_name, _value]) => tok_name === name
// }

// const global_modifiers = ["rec", "option"]

// class AstNodeRule {
//   /** @type {string} */
//   name
//   /** @type {Array<(([tok_name, tok_val]) => boolean) | AstNodeRule | null>} */
//   rules = []

//   constructor(name) {
//     this.name = name
//     return autocall(this)
//   }

//   from() {
//     return new Proxy(this, {
//       get: (self, name) => {
//         if (Ast.current_ast.debug) console.log("from." + name, self)

//         if (global_modifiers.includes(name)) return self[name]()

//         const rule = new AstNodeRule(name)
//         rule.rules.push(global_rules.is_name_the_same(name))
//         rule.parent_rule = self

//         self.rules.push(rule)

//         return rule
//       }
//     })
//   }

//   then() {
//     return new Proxy(this, {
//       get: (self, name) => {
//         if (Ast.current_ast.debug) console.log("then." + name, self)

//         if (!self.parent_rule) throw new Error(`Unreachable`);

//         const parent = self.parent_rule
//         delete self.parent_rule
//         delete self.prev_command

//         return parent.from()[name]
//       }
//     })
//   }

//   or() {
//     return new Proxy(this, {
//       get: (self, name, receiver) => {
//         if (Ast.current_ast.debug) console.log("or." + name, self)
//         let result = Reflect.get(self, name, receiver)
//         if (!["function", "undefined"].includes(typeof result)) throw new Error("'or' may receive either a name of a node, or a query 'rec'")

//         if (name !== 'rec') {
//           self.name += " or " + name
//           let node = new AstNodeRule(name)

//           const prev_parse = self.parse
//    
//         throw {self, name, result, node}
//       }
//     })
//   }

//   rec() {
//     return new Proxy(this, {
//       get: (self, name) => {
//         if (Ast.current_ast.debug) console.log("rec." + name, self)
//         let node = Ast.current_ast.nodes.find((v) => v.name === name)
//         if (node === undefined) {
//           node = new AstNodeRule(name)
//           Ast.current_ast.nodes.push(node)
//         }
//         node.parent_rule = self
//         self.rules.push(node)
//         return autocall(node)
//       }
//     })
//   }

//   option() {
//     return new Proxy(this, {
//       get: (self, name) => {
//         const rule = self.from()[name]
//         const prev_parse = rule.parse
//         rule.parse = (tokens, recurse) => {
//           const result = prev_parse(tokens, recurse)
//           if (result === null) {
//             self.none_action()
//             return {
//               skip: true,
//               tokens_consumed: result.tokens_consumed
//             }
//           }
//           self.some_action()
//           return result
//         }
//         return rule
//       }
//     })
//   }

//   is(regex) {
//     if (Ast.current_ast.debug) console.log(this.name + ".is", regex, this)
//     if (Ast.current_ast.debug) console.log("is:", this.rules.at(-1)?.toString?.())
//     const func = this.rules.pop()
//     this.rules.push(([_tok_name, value]) => regex.test(value))
//     // this.rules.push(([_tok_name, value]) => (console.log("is", func?.toString?.()), func([_tok_name, value])) && (console.log("is", regex.toString(), value), regex.test(value)))
//     return autocall(this)
//   }

//   end() {
//     if (Ast.current_ast.debug) console.log("end", this)
//     const parent = this.parent_rule
//     delete this.parent_rule
//     delete this.prev_command
//     if (parent.parent_rule !== undefined) {
//       return parent.end()
//     }
//     delete parent.parent_rule
//     delete parent.prev_command
//     return parent
//   }

//   action(action) {
//     this.rules.push((_) => (action(), null))
//     return autocall(this)
//   }

//   on_err(action) {
//     this.err_action = action
//     return autocall(this)
//   }

//   on_some(action) {
//     this.some_action = action
//     return autocall(this)
//   }

//   on_none(action) {
//     this.none_action = action
//     return autocall(this)
//   }

//   parse(tokens, recurse = false) {
//     if (Ast.current_ast.debug) console.log(this.name)
//     let tokens_position = 0
//     let rules_position = 0
//     let result = {
//       name: this.name,
//       acc: []
//     }
//     while (rules_position < this.rules.length) {
//       let rule = this.rules[rules_position++]
//       // console.log(rule, tokens[tokens_position])
//       if (Ast.current_ast.debug) console.log(tokens.slice(tokens_position))
//       switch (true) {
//         case rule instanceof AstNodeRule:
//           const foo = rule.parse(tokens.slice(tokens_position), true)
//           if (Ast.current_ast.debug) console.log(rule)
//           if (foo === null) {
//             this.err_action()
//             return { skip: true, tokens_consumed: tokens_position }
//           }
//           if (!foo.skip)
//             result.acc.push(foo.result)
//           tokens_position += foo.tokens_consumed
//           break
//         default:
//           const ok = rule(tokens[tokens_position] || [null, null])
//           if (Ast.current_ast.debug) console.log(rule.toString())
//           if (ok === null) break
//           if (ok) {
//             result.acc.push(...tokens[tokens_position].slice(1))
//             tokens_position += 1
//           } else return null
//           break
//       }
//     }
//     return (recurse ? {
//       result, tokens_consumed: tokens_position
//     } : result)
//   }
// }

// export class Ast {
//   /** @type {Array<AstNode>} */
//   nodes = []
//   /** @type {Tokenizer} */
//   tokenizer

//   /** @type {Ast} */
//   static current_ast = null

//   constructor(tokenizer, settings = {}) {
//     this.debug = settings.debug ?? false
//     this.tokenizer = tokenizer
//     return new Proxy(this, {
//       get: (self, name, receiver) => {
//         Ast.current_ast = self
//         let result = Reflect.get(self, name, receiver)
//         result ??= self.nodes.find((v) => v.name === name)
//         if (result === undefined && typeof name === "string") {
//           result = new AstNodeRule(name)
//           self.nodes.push(result)
//         }
//         return result
//       }
//     })
//   }
// }
