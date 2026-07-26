--[[
Generate the action reference from the action definition itself.

`action.yml` is the single source of truth for what the action accepts and
returns, and any table that repeats it by hand drifts the moment an input is
added. This filter reads `action.yml` and `package.json` at render time and
fills in:

  - `::: {#action-inputs}`, replaced by the inputs table;
  - `::: {#action-outputs}`, replaced by the outputs table;
  - `[]{.action-ref}`, replaced by `mcanouil/<repository>@v<major>`.

Inputs and outputs keep the order they have in `action.yml`, which groups
related options together.
]]

local REPOSITORY = "mcanouil/quarto-extensions-updater"

--- Read a whole file, or return nil when it cannot be opened.
local function read_file(path)
  local handle = io.open(path, "r")
  if not handle then
    return nil
  end
  local content = handle:read("a")
  handle:close()
  return content
end

--- Locate a file at the repository root. Pandoc runs with the input file's
--- directory as the working directory, so search from the project root and
--- then walk upwards.
local function read_root_file(name)
  local candidates = {}
  local project = os.getenv("QUARTO_PROJECT_DIR")
  if project then
    table.insert(candidates, project .. "/../" .. name)
    table.insert(candidates, project .. "/" .. name)
  end
  local prefix = ""
  for _ = 1, 4 do
    table.insert(candidates, prefix .. name)
    prefix = prefix .. "../"
  end

  for _, candidate in ipairs(candidates) do
    local content = read_file(candidate)
    if content then
      return content
    end
  end
  return nil
end

--- Strip surrounding quotes from a YAML scalar.
local function unquote(value)
  local single = value:match("^'(.*)'$")
  if single then
    return (single:gsub("''", "'"))
  end
  local double = value:match('^"(.*)"$')
  if double then
    return double
  end
  return value
end

--[[
Parse the `inputs:` or `outputs:` block of `action.yml`.

The file is a flat two-level mapping: an entry name at two spaces, its fields
at four, every value a single-line scalar. Anything deeper or wrapped over
several lines is not handled, and is reported rather than silently dropped.
Returns a list of `{ name, description, required, default }` in file order.
]]
local function parse_section(text, section)
  local entries = {}
  local current = nil
  local in_section = false

  for line in text:gmatch("[^\n]+") do
    if line:match("^%s*#") then
      -- Comments carry no value.
    elseif line:match("^%S") then
      -- A top-level key ends the section it follows.
      in_section = line:match("^" .. section .. ":%s*$") ~= nil
      current = nil
    elseif line:match("^%s*$") then
      -- Blank lines separate entries.
    elseif in_section then
      local name = line:match("^  ([%w%-_]+):%s*$")
      local field, value = line:match("^    ([%w%-_]+):%s*(.-)%s*$")
      if name then
        current = { name = name }
        table.insert(entries, current)
      elseif field and current then
        current[field] = unquote(value)
      else
        quarto.log.warning("[action-reference] unexpected line in " .. section .. ": " .. line)
      end
    end
  end

  return entries
end

--- Escape a YAML value for use inside a Markdown table cell.
local function escape(text)
  return (text:gsub("([\\`*_{}%[%]<>|#%$])", "\\%1"))
end

--- Render a value as a code span, or as an empty string marker when unset.
local function code(value)
  if value == nil or value == "" then
    return "`\"\"`"
  end
  return "`" .. value .. "`"
end

local function table_blocks(rows)
  return pandoc.read(table.concat(rows, "\n"), "markdown").blocks
end

local function inputs_table()
  local text = read_root_file("action.yml")
  if not text then
    quarto.log.warning("[action-reference] action.yml not found; leaving the placeholder in place")
    return nil
  end

  local rows = {
    "| Input | Description | Required | Default |",
    "| --- | --- | --- | --- |",
  }
  for _, input in ipairs(parse_section(text, "inputs")) do
    table.insert(
      rows,
      string.format(
        "| `%s` | %s | %s | %s |",
        input.name,
        escape(input.description or ""),
        input.required == "true" and "Yes" or "No",
        code(input.default)
      )
    )
  end
  return table_blocks(rows)
end

local function outputs_table()
  local text = read_root_file("action.yml")
  if not text then
    quarto.log.warning("[action-reference] action.yml not found; leaving the placeholder in place")
    return nil
  end

  local rows = {
    "| Output | Description |",
    "| --- | --- |",
  }
  for _, output in ipairs(parse_section(text, "outputs")) do
    table.insert(rows, string.format("| `%s` | %s |", output.name, escape(output.description or "")))
  end
  return table_blocks(rows)
end

--- The major version the examples should reference, from `package.json`.
local function action_reference()
  local text = read_root_file("package.json")
  if not text then
    quarto.log.warning("[action-reference] package.json not found; leaving the placeholder in place")
    return nil
  end
  local major = text:match('"version"%s*:%s*"(%d+)%.')
  if not major then
    quarto.log.warning("[action-reference] no version found in package.json; leaving the placeholder in place")
    return nil
  end
  return pandoc.Code(string.format("%s@v%s", REPOSITORY, major))
end

function Div(div)
  local blocks = nil
  if div.identifier == "action-inputs" then
    blocks = inputs_table()
  elseif div.identifier == "action-outputs" then
    blocks = outputs_table()
  end
  if not blocks then
    return nil
  end
  div.identifier = ""
  div.content = blocks
  return div
end

function Span(span)
  if not span.classes:includes("action-ref") then
    return nil
  end
  return action_reference()
end
