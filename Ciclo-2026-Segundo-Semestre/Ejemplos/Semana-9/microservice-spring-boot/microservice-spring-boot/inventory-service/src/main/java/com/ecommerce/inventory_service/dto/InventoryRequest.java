package com.ecommerce.inventory_service.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class InventoryRequest {
    @NotBlank(message = "El SKU no puede estar vacío")
    private String sku;

    @Min(value = 0, message = "La cantidad no puede ser negativa")
    private Integer quantity;
}
