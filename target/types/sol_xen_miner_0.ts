/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sol_xen_miner.json`.
 */
export type SolXenMiner = {
  "address": "69zNTfcY19Uqn76GjJnMddbZfo4MomLJTjnm5Q1f1TLZ",
  "metadata": {
    "name": "solXenMiner",
    "version": "0.1.0-epsilon",
    "spec": "0.1.0",
    "description": "solXEN Miner Program. Search for hash patterns, earn points"
  },
  "instructions": [
    {
      "name": "initMiner",
      "discriminator": [
        144,
        159,
        202,
        208,
        234,
        154,
        242,
        55
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalXnRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  120,
                  110,
                  45,
                  109,
                  105,
                  110,
                  101,
                  114,
                  45,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "kind"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "kind",
          "type": "u8"
        }
      ]
    },
    {
      "name": "mineHashes",
      "discriminator": [
        192,
        6,
        168,
        29,
        123,
        183,
        150,
        48
      ],
      "accounts": [
        {
          "name": "globalXnRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  120,
                  110,
                  45,
                  109,
                  105,
                  110,
                  101,
                  114,
                  45,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "kind"
              }
            ]
          }
        },
        {
          "name": "xnByEth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  120,
                  110,
                  45,
                  98,
                  121,
                  45,
                  101,
                  116,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "eth_account.address"
              },
              {
                "kind": "arg",
                "path": "kind"
              },
              {
                "kind": "const",
                "value": [
                  116,
                  25,
                  234,
                  204,
                  22,
                  211,
                  109,
                  87,
                  100,
                  246,
                  182,
                  150,
                  197,
                  130,
                  120,
                  183,
                  162,
                  98,
                  165,
                  62,
                  245,
                  94,
                  160,
                  234,
                  83,
                  155,
                  190,
                  155,
                  192,
                  183,
                  107,
                  35
                ]
              }
            ]
          }
        },
        {
          "name": "xnBySol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  120,
                  110,
                  45,
                  98,
                  121,
                  45,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "arg",
                "path": "kind"
              },
              {
                "kind": "const",
                "value": [
                  116,
                  25,
                  234,
                  204,
                  22,
                  211,
                  109,
                  87,
                  100,
                  246,
                  182,
                  150,
                  197,
                  130,
                  120,
                  183,
                  162,
                  98,
                  165,
                  62,
                  245,
                  94,
                  160,
                  234,
                  83,
                  155,
                  190,
                  155,
                  192,
                  183,
                  107,
                  35
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ethAccount",
          "type": {
            "defined": {
              "name": "ethAccount"
            }
          }
        },
        {
          "name": "kind",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "globalXnRecord",
      "discriminator": [
        29,
        48,
        183,
        205,
        201,
        7,
        241,
        7
      ]
    },
    {
      "name": "userEthXnRecord",
      "discriminator": [
        224,
        152,
        129,
        49,
        149,
        104,
        210,
        196
      ]
    },
    {
      "name": "userSolXnRecord",
      "discriminator": [
        105,
        200,
        79,
        162,
        225,
        52,
        172,
        238
      ]
    }
  ],
  "events": [
    {
      "name": "hashEvent",
      "discriminator": [
        72,
        165,
        108,
        28,
        78,
        144,
        127,
        138
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mintIsAlreadyActive",
      "msg": "solXEN Mint has been already initialized"
    },
    {
      "code": 6001,
      "name": "mintIsNotActive",
      "msg": "solXEN Mint has not yet started or is over"
    },
    {
      "code": 6002,
      "name": "zeroSlotValue",
      "msg": "Slot value is Zero"
    },
    {
      "code": 6003,
      "name": "invalidMinerKind",
      "msg": "Invalid miner kind"
    },
    {
      "code": 6004,
      "name": "invalidEthAddressChecksum",
      "msg": "Invalid Ethereum address checksum"
    },
    {
      "code": 6005,
      "name": "invalidEthAddressData",
      "msg": "Ethereum address data doesnt match"
    }
  ],
  "types": [
    {
      "name": "ethAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "address",
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "addressStr",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "globalXnRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amp",
            "type": "u16"
          },
          {
            "name": "lastAmpSlot",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "hashes",
            "type": "u64"
          },
          {
            "name": "superhashes",
            "type": "u32"
          },
          {
            "name": "points",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "hashEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "ethAccount",
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "hashes",
            "type": "u8"
          },
          {
            "name": "superhashes",
            "type": "u8"
          },
          {
            "name": "points",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userEthXnRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hashes",
            "type": "u64"
          },
          {
            "name": "superhashes",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "userSolXnRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hashes",
            "type": "u64"
          },
          {
            "name": "superhashes",
            "type": "u32"
          },
          {
            "name": "points",
            "type": "u128"
          }
        ]
      }
    }
  ]
};
