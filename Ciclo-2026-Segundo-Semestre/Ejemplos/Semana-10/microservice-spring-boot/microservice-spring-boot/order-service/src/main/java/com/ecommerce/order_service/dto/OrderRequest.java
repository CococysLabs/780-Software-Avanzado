package com.ecommerce.order_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class OrderRequest {
    @NotEmpty(message = "La orden debe contener al menos un item")
    @Valid
    private List<OrderLineItemsRequest> orderLineItemsList;

    @NotNull(message = "El email es requerido")
    @Email(message = "El formato del email no es válido")
    private String email;
}