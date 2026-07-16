const SCIENCEONE_RUN_BASE = "https://www.scienceone.cn/tools_hub/tooluniverse/run";

const CALCULATION_TYPES = new Set(["scf", "relax", "md", "nscf", "band"]);
const MAGNETIC_ORDERINGS = new Set(["FM", "AFM", "FiM", "NM", "Unknown"]);
const PATH_TYPES = new Set(["setyawan_curtarolo", "hinuma"]);

class RequestError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "RequestError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, field, options = {}) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RequestError(`${field} must be a finite number.`);
  if (options.integer && !Number.isInteger(number)) throw new RequestError(`${field} must be an integer.`);
  if (options.min !== undefined && number < options.min) throw new RequestError(`${field} must be at least ${options.min}.`);
  if (options.max !== undefined && number > options.max) throw new RequestError(`${field} must be at most ${options.max}.`);
  return number;
}

function httpsUrl(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new RequestError(`${field} is required.`);
  if (text.length > 2048) throw new RequestError(`${field} is too long.`);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new RequestError(`${field} must be a valid URL.`);
  }
  if (url.protocol !== "https:") throw new RequestError(`${field} must use HTTPS.`);
  if (url.username || url.password) throw new RequestError(`${field} cannot contain credentials.`);
  return url.toString();
}

function validateCrystalStructure(input) {
  const payload = plainObject(input);
  const species = Array.isArray(payload.species) ? payload.species.map(value => String(value || "").trim()) : [];
  if (!species.length || species.length > 64) throw new RequestError("species must contain 1 to 64 element symbols.");
  if (species.some(symbol => !/^[A-Z][a-z]?$/.test(symbol))) {
    throw new RequestError("species must contain valid element symbols such as Fe or O.");
  }

  const coords = Array.isArray(payload.coords) ? payload.coords : [];
  if (coords.length !== species.length) throw new RequestError("coords must contain one fractional-coordinate row per species entry.");
  const normalizedCoords = coords.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 3) throw new RequestError(`coords[${index}] must contain exactly three numbers.`);
    return row.map((value, axis) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new RequestError(`coords[${index}][${axis}] must be a finite number.`);
      return number;
    });
  });

  return {
    Lattice_pickle_file_url: httpsUrl(payload.Lattice_pickle_file_url, "Lattice_pickle_file_url"),
    species,
    coords: normalizedCoords
  };
}

function validateQuantumEspresso(input) {
  const payload = plainObject(input);
  const calculationType = String(payload.calculation_type || "").trim().toLowerCase();
  if (!CALCULATION_TYPES.has(calculationType)) {
    throw new RequestError("calculation_type must be one of scf, relax, md, nscf, or band.");
  }
  const pseudoUrls = Array.isArray(payload.pseudo_urls) ? payload.pseudo_urls : [];
  if (!pseudoUrls.length || pseudoUrls.length > 24) throw new RequestError("pseudo_urls must contain 1 to 24 HTTPS URLs.");
  const priority = finiteNumber(payload.priority ?? 1, "priority", { integer: true, min: 1, max: 10 });
  return {
    calculation_type: calculationType,
    input_url: httpsUrl(payload.input_url, "input_url"),
    pseudo_urls: pseudoUrls.map((value, index) => httpsUrl(value, `pseudo_urls[${index}]`)),
    priority
  };
}

function optionalBoolean(value, field) {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value !== "boolean") throw new RequestError(`${field} must be true or false.`);
  return value;
}

function validateBandStructure(input) {
  const payload = plainObject(input);
  const output = {};
  const numericFields = ["band_gap_min", "band_gap_max", "efermi_min", "efermi_max"];
  numericFields.forEach(field => {
    const value = finiteNumber(payload[field], field);
    if (value !== undefined) output[field] = value;
  });
  if (output.band_gap_min !== undefined && output.band_gap_max !== undefined && output.band_gap_min > output.band_gap_max) {
    throw new RequestError("band_gap_min cannot exceed band_gap_max.");
  }
  if (output.efermi_min !== undefined && output.efermi_max !== undefined && output.efermi_min > output.efermi_max) {
    throw new RequestError("efermi_min cannot exceed efermi_max.");
  }

  ["is_gap_direct", "is_metal", "all_fields"].forEach(field => {
    const value = optionalBoolean(payload[field], field);
    if (value !== undefined) output[field] = value;
  });

  if (payload.magnetic_ordering) {
    const value = String(payload.magnetic_ordering).trim();
    if (!MAGNETIC_ORDERINGS.has(value)) throw new RequestError("magnetic_ordering is not supported.");
    output.magnetic_ordering = value;
  }
  if (payload.path_type) {
    const value = String(payload.path_type).trim();
    if (!PATH_TYPES.has(value)) throw new RequestError("path_type is not supported.");
    output.path_type = value;
  }

  const numChunks = finiteNumber(payload.num_chunks, "num_chunks", { integer: true, min: 1, max: 20 });
  const chunkSize = finiteNumber(payload.chunk_size, "chunk_size", { integer: true, min: 1, max: 500 });
  if (numChunks !== undefined) output.num_chunks = numChunks;
  if (chunkSize !== undefined) output.chunk_size = chunkSize;

  if (payload.fields) {
    const fields = String(payload.fields).trim();
    if (fields.length > 500 || !/^[A-Za-z0-9_, ]+$/.test(fields)) throw new RequestError("fields must be a comma-separated field list.");
    output.fields = fields;
  }
  return output;
}

function toolDefinition(tool) {
  if (tool === "crystal_structure") {
    return {
      upstreamUrl: `${SCIENCEONE_RUN_BASE}/crystalStructureGen`,
      validate: validateCrystalStructure,
      timeoutMs: 55_000
    };
  }
  if (tool === "quantum_espresso") {
    return {
      upstreamUrl: `${SCIENCEONE_RUN_BASE}/QuantumEspresso`,
      validate: validateQuantumEspresso,
      timeoutMs: 55_000
    };
  }
  if (tool === "band_structure") {
    const configuredUrl = String(process.env.SCIENCEONE_BAND_STRUCTURE_URL || "").trim();
    if (!configuredUrl) {
      throw new RequestError("The ScienceOne band-structure request URL is not configured yet.", 503);
    }
    return {
      upstreamUrl: httpsUrl(configuredUrl, "SCIENCEONE_BAND_STRUCTURE_URL"),
      validate: validateBandStructure,
      timeoutMs: 55_000
    };
  }
  throw new RequestError("Unsupported ScienceOne tool.", 400);
}

async function parseUpstreamResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 20_000) };
  }
}

async function runScienceOneTool(tool, input) {
  const definition = toolDefinition(tool);
  const payload = definition.validate(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), definition.timeoutMs);
  let response;
  try {
    const headers = { "Content-Type": "application/json" };
    if (process.env.SCIENCEONE_API_TOKEN) headers.Authorization = `Bearer ${process.env.SCIENCEONE_API_TOKEN}`;
    response = await fetch(definition.upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new RequestError("ScienceOne request timed out.", 504);
    throw new RequestError("ScienceOne could not be reached.", 502, error?.message || String(error));
  } finally {
    clearTimeout(timer);
  }

  const upstream = await parseUpstreamResponse(response);
  if (!response.ok) {
    throw new RequestError(`ScienceOne returned HTTP ${response.status}.`, 502, upstream);
  }
  if (String(upstream?.status || "").toLowerCase() === "failed") {
    throw new RequestError(upstream.error || "ScienceOne reported a failed tool call.", 502, upstream);
  }
  return {
    ok: true,
    tool,
    submitted_payload: payload,
    upstream
  };
}

module.exports = {
  RequestError,
  runScienceOneTool
};
