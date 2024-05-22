#!/bin/bash

# Function to display a colored bar
display_bar() {
    local percentage=$1
    local bar_length=50
    local filled_length=$((bar_length * percentage / 100))
    if [ $filled_length -gt $bar_length ]; then
        filled_length=$bar_length
    fi
    local unfilled_length=$((bar_length - filled_length))

    printf "\033[1;32m%0.s█" $(seq 1 $filled_length)   # Green filled part
    printf "\033[1;31m%0.s█" $(seq 1 $unfilled_length) # Red unfilled part
    printf "\033[0m"                                   # Reset color
}

while true; do
  # Fetch the current slot and adjust to the previous slot if no data is found
  CURRENT_SLOT=$(solana slot)

  while true; do
    # Fetch block information for the given slot ID
    BLOCK_INFO=$(solana block $CURRENT_SLOT --output json 2>/dev/null)

    # Check if the BLOCK_INFO contains valid data
    if [ "$(echo $BLOCK_INFO | jq -r '.transactions | length')" == "null" ]; then
      echo "No block information available for slot $CURRENT_SLOT"
      CURRENT_SLOT=$((CURRENT_SLOT - 1)) # Decrement slot number if no data is found
    else
      break
    fi
  done

  # Calculate the total compute units consumed
  TOTAL_CU=$(echo $BLOCK_INFO | jq '[.transactions[] | .meta.computeUnitsConsumed // 0] | add')

  # Skip blocks where TOTAL_CU is undefined
  if [ -z "$TOTAL_CU" ]; then
    # echo "Skipping block with undefined TOTAL_CU (Slot: $CURRENT_SLOT)"
    continue
  fi


  # Calculate the total number of transactions
  TX_COUNT=$(echo $BLOCK_INFO | jq '.transactions | length')

  # Calculate the total fees spent and convert to SOL
  TOTAL_FEES_LAMPORTS=$(echo $BLOCK_INFO | jq '[.transactions[] | .meta.fee // 0] | add')
  TOTAL_FEES_SOL=$(awk -v lamports="$TOTAL_FEES_LAMPORTS" 'BEGIN {printf "%.9f", lamports / 1000000000}')

  # Calculate the number of voting transactions (transactions with 2100 CU)
  VOTE_TX_COUNT=$(echo $BLOCK_INFO | jq '[.transactions[] | select(.meta.computeUnitsConsumed == 2100)] | length')

  # Check for valid TOTAL_CU before calculating the percentage
  if [ "$TOTAL_CU" -eq 0 ]; then
    PERCENTAGE="00.00"
  else
    MAX_CU=48000000
    PERCENTAGE=$(awk -v total_cu="$TOTAL_CU" -v max_cu="$MAX_CU" 'BEGIN {printf "%6.2f", (total_cu / max_cu) * 100}')
  fi

  # Skip blocks with less than 5% CU utilization
  PERCENTAGE_INT=$(echo $PERCENTAGE | awk '{print int($0)}')
  if [ $PERCENTAGE_INT -lt 5 ]; then
    # echo "Skipping block with less than 5% CU utilization (Slot: $CURRENT_SLOT, CU: $PERCENTAGE%)"
    continue
  fi

  # Display the result on one line with fixed-width columns
  printf "Slot: \033[1;34m%-10s\033[0m " $CURRENT_SLOT
  printf "Total TX: \033[1;34m%-8s\033[0m " $TX_COUNT
  printf "Vote TX: \033[1;34m%-8s\033[0m " $VOTE_TX_COUNT
  printf "Fees (SOL): \033[1;34m%-12s\033[0m " $TOTAL_FEES_SOL
  printf "Total CU: \033[1;34m%-10s\033[0m " $TOTAL_CU
  printf "CU %%: \033[1;34m%-7s%%\033[0m " $PERCENTAGE
  display_bar $PERCENTAGE_INT
  echo

  # Sleep for a while before the next iteration
  sleep 0.5  # Adjust the sleep duration as needed
done
