import { Tokenizer, BNFParser } from "./lib.js"

// Example usage:
const src = `
  a = 1
  b = a
  c = a + b
`

const tok = new Tokenizer()
tok.IDENTIFIER.is(/[a-zA-Z_][a-zA-Z0-9_]*/);
tok.NUMBER.is(/-?\d(?:_?\d+)*\.?(?:\d(?:_?\d+)*)?/)
tok.SYMBOL.is(/[<>*&|]?[-+*/%<>&|^!]=?/);
const token_tree = tok.tokenize(src)

// for (const token of token_tree) {
//   console.log(token)
// }

const bnf = new BNFParser()
console.log(JSON.stringify([...bnf.parse`
<program> ::= <function-definition>+

<function-definition> ::=
  <identifier> "(" <parameter-list>? ")" <compound-statement>

<parameter-list> ::= <identifier> ("," <identifier>)*

<compound-statement> ::= "{" <statement-list>? "}"

<statement-list> ::= <statement>+

<statement> ::=
  <expression-statement>
  | <compound-statement>
  | <selection-statement>
  | <iteration-statement>
  | <jump-statement>

<expression-statement> ::= <expression>? ";"

<selection-statement> ::=
  "if" "(" <expression> ")" <statement> ("else" <statement>)?
  | "switch" "(" <expression> ")" <statement>

<iteration-statement> ::=
  "while" "(" <expression> ")" <statement>
  | "do" <statement> "while" "(" <expression> ")" ";"
  | "for" "(" <expression-statement> <expression-statement> <expression>? ")" <statement>

<jump-statement> ::=
  "goto" <identifier> ";"
  | "continue" ";"
  | "break" ";"
  | "return" <expression>? ";"

<expression> ::=
  <assignment-expression> ("," <assignment-expression>)*

<assignment-expression> ::=
  <conditional-expression> ("=" <conditional-expression>)*

<conditional-expression> ::=
  <logical-or-expression> ("?" <expression> ":" <conditional-expression>)?

<logical-or-expression> ::=
  <logical-and-expression> ("||" <logical-and-expression>)*

<logical-and-expression> ::=
  <equality-expression> ("&&" <equality-expression>)*

<equality-expression> ::=
  <relational-expression> (("==" | "!=") <relational-expression>)*

<relational-expression> ::=
  <additive-expression> (("<" | ">" | "<=" | ">=") <additive-expression>)*

<additive-expression> ::=
  <multiplicative-expression> (("+" | "-") <multiplicative-expression>)*

<multiplicative-expression> ::=
  <unary-expression> (("*" | "/" | "%") <unary-expression>)*

<unary-expression> ::=
  ("++" | "--" | "!" | "~" | "+" | "-" | "*" | "&") <unary-expression>
  | <postfix-expression>

<postfix-expression> ::=
  <primary-expression>
  | <postfix-expression> "[" <expression> "]"
  | <postfix-expression> "(" <argument-expression-list>? ")"
  | <postfix-expression> "++"
  | <postfix-expression> "--"

<primary-expression> ::=
  <identifier>
  | <constant>
  | "(" <expression> ")"

<argument-expression-list> ::=
  <assignment-expression> ("," <assignment-expression>)*

<identifier> ::= [a-zA-Z_][a-zA-Z0-9_]*

<constant> ::=
  <integer-constant>
  | <floating-constant>
  | <character-constant>
  | <string-literal>

<integer-constant> ::= [0-9]+

<floating-constant> ::= [0-9]*"."[0-9]+ | [0-9]+"."[0-9]*

<character-constant> ::= "'" ([^'\\] | "\\") "'"

<string-literal> ::= "\"" ([^\"\\] | "\\")* "\""`]))
// const ast = new Ast(tok, {
//   debug: false
// });

// // ast.debug = true
// ast.ASSIGNMENT
//   .from.IDENTIFIER
//   .then.SYMBOL
//   .then.rec.EXPRESSION
//   .end
// ast.BINOP
//   .from.rec.EXPRESSION
//   .then.SYMBOL.or.IDENTIFIER.is(/is|or|and/)
//   .then.rec.EXPRESSION
//   .end
// const paren_level = []
// ast.EXPRESSION
//   .on_err((node) => void (node[0] && paren_level.at(-1) === node ? paren_level.pop() : 0))
//   .from.option.SYMBOL.is(/\(/)
//   .on_some((node) => paren_level.push(node))
//   .then.IDENTIFIER.or.NUMBER.or.rec.BINOP
//   .if((node) => paren_level.at(-1) === node)
//   .then.SYMBOL.is(/\)/)
//   .action(() => paren_level.pop())
//   .end
// console.log(ast.EXPRESSION)
// const node_tree = ast.parse(token_tree)

// function scope(type) {
//   const vars = {}
//   const free_ids = []
//   return {
//     loc: type,
//     count: 0,
//     get: (name) => vars[name],
//     get_or_new: (name) => vars[name] ??= free_ids.pop() ?? this.count++,
//     unset: (name) => void (free_ids.push(vars[name]), free_ids.sort(), delete vars[name]),
//   }
// }
// const name_table = new class {
//   scopes = [scope("global")]
//   find(name) {
//     for (let scope_id = scopes.length - 1; scope_id >= 0; scope_id--) {
//       const var_id = this.scopes[scope_id].get(name)
//       if (var_id) return { scope_id, var_id }
//     }
//     throw `Variable '${name}' is undefined.`
//   }
//   get cur() { return this.scopes.at(-1) }
//   get global() { return this.scopes.at(0) }
// }()
// const hir = new Ir(ast);
// hir.node`ASSIGN`.from`ASSIGNMENT`.new(node => {
//   // 0: name, 1: expression
//   // INFO: right now it will reassign or create new value for current scope, no shadowing, no dropping
//   const expr = hir.process(node[1])
//   const name = node[0]
//   let ids
//   try { ids = name_table.find(name) }
//   catch {
//     ids = {
//       scope_id: name_table.scopes.length - 1,
//       var_id: name_table.cur.get_or_new(name)
//     }
//   }
//   const dest = hir.node`VAR_SET`.val({
//     location: name_table.scopes[ids.scope_id].loc,
//     scope_id: ids.scope_id,
//     var_id: ids.var_id,
//   })
//   return { expr, dest }
// })
// hir.node`EXPR`.from`EXPRESSION`.new(node => {
//   switch (node.val.type) {
//     case "BINOP":
//       const result = hir.process(node.val[1])
//       if (node.val[0] && node.val[2])
//         result.precedence = 1
//       return result
//     case "IDENTIFIER": {
//       const ids = name_table.find(node.val[1])
//       return hir.node`VAR_GET`.val({
//         location: name_table.scopes[ids.scope_id].loc,
//         scope_id: ids.scope_id,
//         var_id: ids.var_id,
//       }) // won't reassign 'type' because it is already set to 'VAR_GET'
//     }
//     case "NUMBER": {
//       const num = node.val[1]
//       return num.search(".") < 0
//         ? hir.node`COMPTIME_INT`.val({
//           val: num,
//           min_bits: Number.parseInt(num).toString(2).length,
//           is_signed: num.startsWith('-'),
//         })
//         : hir.node`COMPTIME_FLOAT`.val({
//           val: num,
//           is_signed: num.startsWith('-'),
//         })
//     }
//   }
// })
// // .then_rec`EXPRESSION`.push()
// // .then`IDENTIFIER`.is(/is|or|and|not/).or`SYMBOL`.is(/[=+-*/%<>&|^]=?/).push()
// // .then_rec`EXPRESSION`.push()
// hir.node`BINOP`.from`BINOP`.new(node => {
//   // 0: expr 1: ident|symbol 2: expr
//   const result = {
//     l: hir.process(node.val[0]), // binop|var_get|comptime_int|comptime_float
//     r: hir.process(node.val[2]), // binop|var_get|comptime_int|comptime_float
//   }
//   switch (node.val[1]) {
//     // 0 - grouping, array indexing, function calls, property access 'a.b' (TODO)
//     // 1 - postfix ops (TODO)
//     // 2 - prefix ops (TODO)
//     case "**":
//       result.op ??= "POW"
//       result.precedence = 3
//       break;
//     case "*":
//       result.op ??= "MUL"
//     case "/":
//       result.op ??= "DIV"
//     case "%":
//       result.op ??= "MOD"
//       result.precedence = 4
//       break
//     case "+":
//       result.op ??= "ADD"
//     case "-":
//       result.op ??= "SUB"
//       result.precedence = 5
//       break
//     case "<<":
//       result.op ??= "SHL"
//     case ">>":
//       result.op ??= "SHR"
//       result.precedence = 6
//       break
//     case "<":
//       result.op ??= "LT"
//     case "<=":
//       result.op ??= "LTE"
//     case ">":
//       result.op ??= "GT"
//     case ">=":
//       result.op ??= "GTE"
//       result.precedence = 7
//       break
//     case "!=":
//       result.op ??= "EQN"
//     case "==", "is":
//       result.op ??= "EQ"
//       result.precedence = 8
//       break
//     case "&":
//       result.op ??= "AND"
//       result.precedence = 9
//       break
//     case "^":
//       result.op ??= "XOR"
//       result.precedence = 10
//       break
//     case "|":
//       result.op ??= "OR"
//       result.precedence = 11
//       break
//     case "&&", "and":
//       result.op ??= "LND"
//       result.precedence = 12
//       break
//     case "||", "or":
//       result.op ??= "LOR"
//       result.precedence = 13
//       break
//     // 14 - ternary operator | expression-style if-else
//     case "**=": result.op ??= "POW"
//     case "*=": result.op ??= "MUL"
//     case "/=": result.op ??= "DIV"
//     case "%=": result.op ??= "MOD"
//     case "+=": result.op ??= "ADD"
//     case "-=": result.op ??= "SUB"
//     case "<<=": result.op ??= "SHL"
//     case ">>=": result.op ??= "SHR"
//     case "<==": result.op ??= "LTE"
//     case ">==": result.op ??= "GTE"
//     case "&=": result.op ??= "AND"
//     case "^=": result.op ??= "XOR"
//     case "|=": result.op ??= "OR"
//     case "&&=": result.op ??= "LND"
//     case "||=": result.op ??= "LOR"
//       if (result.l.type !== "VAR_GET") throw "Compound assingnment should assign to a variable"
//       result.precedence = 15
//       return {
//         l: hir.node`VAR_SET`.val({ ...result.l }),
//         r: hir.node`BINOP`.val(result),
//         precedence: 15,
//         op: "TEE",
//       }
//     default: throw `Unknown operator ${node.val[1]}`
//   }
//   return result
// })
// // rules are only applied to hir nodes, errors othervise
// hir.rule`FIX_PRECEDENCE_ARRANGEMENT`.for`BINOP`.new(node => {
//   // type: binop l, r: binop|var_get|comptime_int|comptime_float precedence: number
//   // so for 2 + 2 * 2 << 2 ** 2
//   // it is: ((2 + (2 * 2)) << (2 ** 2))
//   // but my impl would have:
//   // ((((2 + 2) * 2) << 2) ** 2)
//   // how would I transform?
//   // (expr ** 2) -> first process all exprs (recursive)
//   // expr is binop, look at precedence
//   // 6(<<), higher than 3(**),
//   // make current expression r of child l (cur.l.r = cur)
//   // make previous r of child l, l of current (cur.l = cur.l.r (stored as tmp))
//   let optimised = false
//   switch (node.l.type) {
//     case "BINOP":
//       hir.rule`FIX_PRECEDENCE_ARRANGEMENT`.run(node.l);
//       if (node.l.precedence > node.precedence) {
//         optimised = true
//         const tmp = node.l.r
//         node.l.r = node
//         node.l = tmp
//       }
//       break;
//     default: break
//   }
//   switch (node.r.type) {
//     case "BINOP":
//       hir.rule`FIX_PRECEDENCE_ARRANGEMENT`.run(node.r);
//       if (node.r.precedence > node.precedence) {
//         optimised = true
//         const tmp = node.r.l
//         node.r.l = node
//         node.r = tmp
//       }
//       break;
//     default: break
//   }
//   return optimised
// })

// const mir = new Ir(hir);

// const clir = new Ir(mir);
// const wasmlir = new Ir(mir);

// // Output code using backend
// const cCode = new CBackend(clir).emit();
// const wasmCode = new WASMBackend(wasmlir).emit();

// document.body.innerText = cCode + '\n' + wasmCode
