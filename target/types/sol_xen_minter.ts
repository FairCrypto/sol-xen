/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sol_xen_minter.json`.
 */
export type SolXenMinter = {
  "address": "3fpRvJQx7WP44ijejJrxAYexP71nC6R7xuysnNmpUP9o",
  "metadata": {
    "name": "solXenMinter",
    "version": "0.1.0-epsilon",
    "spec": "0.1.0",
    "description": "solXEN Minter Program. Convert mined points to solXEN tokens"
  },
  "instructions": [
    {
      "name": "createMint",
      "discriminator": [
        69,
        44,
        215,
        132,
        253,
        214,
        41,
        45
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
          "name": "metadata",
          "type": {
            "defined": {
              "name": "initTokenParams"
            }
          }
        }
      ]
    },
    {
      "name": "mintTokens",
      "discriminator": [
        59,
        132,
        24,
        246,
        122,
        39,
        8,
        243
      ],
      "accounts": [
        {
          "name": "userRecord"
        },
        {
          "name": "userTokensRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  45,
                  120,
                  101,
                  110,
                  45,
                  109,
                  105,
                  110,
                  116,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "minerProgram"
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
      "name": "revokeMintAuthority",
      "discriminator": [
        140,
        52,
        61,
        238,
        209,
        157,
        189,
        32
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "userTokensRecord",
      "discriminator": [
        113,
        218,
        188,
        234,
        62,
        173,
        78,
        230
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
      "name": "badOwner",
      "msg": "Bad account owner"
    },
    {
      "code": 6004,
      "name": "badParam",
      "msg": "Bad param value"
    }
  ],
  "types": [
    {
      "name": "initTokenParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userTokensRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pointsCounters",
            "type": {
              "array": [
                "u128",
                4
              ]
            }
          },
          {
            "name": "tokensMinted",
            "type": "u128"
          }
        ]
      }
    }
  ]
};
