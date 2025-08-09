declare module 'katex/contrib/auto-render' {
  const renderMathInElement: any
  export default renderMathInElement
  export { renderMathInElement }
}

// Optional fallback if TypeScript cannot resolve mermaid types pre-install
declare module 'mermaid' {
  const mermaid: any
  export default mermaid
}

// Local component declarations (no published types)
declare module './components/CodeBlock' {
  const CodeBlock: any
  export default CodeBlock
}
declare module '../components/CodeBlock' {
  const CodeBlock: any
  export default CodeBlock
}
